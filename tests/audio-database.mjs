import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  migrations,
  asUser,
  user,
} from "./database-harness.mjs";
import { validateSong } from "../lib/validation.ts";
import {
  normalizeCommonsPreview,
  authorizedRecordings,
} from "../lib/preview-discovery.ts";
const metadata = JSON.parse(
  readFileSync("tests/fixtures/commons-previews.json", "utf8"),
);
const literal = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const db = databaseHarness("audio"),
  { sql } = db;
const sources = authorizedRecordings.map((r) => ({
  songId: r.id,
  ...normalizeCommonsPreview(metadata.query.pages[r.pageId], r),
}));
const attach = (items, actor = 1) =>
  sql(asUser(actor, `select attach_discovered_previews(${literal(items)})`));
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log("PASS " + name);
}
try {
  await db.create();
  const audioIndex = migrations().findIndex((f) => f.startsWith("0014_"));
  await db.migrate(migrations().slice(0, audioIndex));
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(
    `insert into auth.users values('${user(1)}','audio-admin@example.test'),('${user(2)}','audio-listener@example.test');update profiles set role='admin' where user_id='${user(1)}'`,
  );
  const before = await sql(
    "select jsonb_agg(to_jsonb(s) order by id) from songs s",
  );
  await db.migrate(migrations().slice(audioIndex));
  await test("audio migration preserves all twenty catalog records, ratings and existing provider links", async () => {
    assert.equal(
      await sql("select jsonb_agg(to_jsonb(s)-'metadata_details' order by id) from songs s"),
      before,
    );
    assert.equal(await sql("select count(*) from song_providers"), "20");
  });
  await sql(
    asUser(
      1,
      `select save_catalog(${literal(authorizedRecordings.map((r) => validateSong({ ...r, status: "active", providers: [] })))})`,
    ),
  );
  await test("reviewed sources attach idempotently without changing scores and remain publicly readable under RLS", async () => {
    assert.equal(JSON.parse(await attach(sources)).attached, 4);
    assert.equal(JSON.parse(await attach(sources)).attached, 4);
    assert.equal(await sql("select count(*) from song_audio_sources"), "4");
    assert.equal(
      await sql(
        "select count(*) from songs where elo_rating<>1500 or matchup_count<>0",
      ),
      "0",
    );
    assert.equal(
      await sql(
        "set role anon;select count(*) from song_catalog where audio_preview is not null",
      ),
      "4",
    );
    assert.equal(
      await sql(
        "set role anon;select audio_preview->>'start_seconds' from song_catalog where id='open-gymnopedie-1'",
      ),
      "0",
    );
    await assert.rejects(
      sql("set role anon;select reviewed_by from song_audio_sources"),
      /permission denied/,
    );
  });
  await test("ordinary users cannot discover, approve or directly edit audio", async () => {
    await assert.rejects(attach(sources, 2), /Admin access required/);
    await assert.rejects(
      sql(
        asUser(
          2,
          "update song_audio_sources set licensing_status='authorized'",
        ),
      ),
      /permission denied/,
    );
    await assert.rejects(
      sql("set role anon;select attach_discovered_previews('[]')"),
      /permission denied/,
    );
  });
  await test("duplicate recording identities and invalid sources roll back the complete attachment batch", async () => {
    const before = await sql(
      "select jsonb_agg(to_jsonb(a) order by song_id) from song_audio_sources a",
    );
    await assert.rejects(
      attach([{ ...sources[0], songId: "respect-aretha" }]),
      /Audio discovery was not saved/,
    );
    await assert.rejects(
      attach([
        sources[0],
        { ...sources[1], url: "https://evil.test/music.mp3" },
      ]),
      /Audio discovery was not saved/,
    );
    assert.equal(
      await sql(
        "select jsonb_agg(to_jsonb(a) order by song_id) from song_audio_sources a",
      ),
      before,
    );
  });
  await test("administrator overrides and unavailable sources survive automatic refresh", async () => {
    await sql(
      asUser(
        1,
        `select save_audio_source('${sources[0].songId}',${literal({ ...sources[0], startSeconds: 8 })})`,
      ),
    );
    await attach(sources);
    assert.equal(
      await sql(
        `select start_seconds||','||auto_managed from song_audio_sources where song_id='${sources[0].songId}'`,
      ),
      "8,false",
    );
    await sql(
      `update song_audio_sources set availability='unavailable' where song_id='${sources[1].songId}'`,
    );
    await attach(sources);
    assert.equal(
      await sql(
        `select availability from song_audio_sources where song_id='${sources[1].songId}'`,
      ),
      "unavailable",
    );
    await sql(
      `update song_audio_sources set availability='available' where song_id='${sources[1].songId}'`,
    );
  });
  await test("preview-only Rank issues authorized songs, preserves vote transactions and stays in preview mode after voting", async () => {
    const issued = JSON.parse(
      await sql(asUser(2, "select start_preview_rank_pair()")),
    );
    const pair = JSON.parse(await sql(asUser(2, "select get_rank_state()")));
    assert.equal(pair.preview_only, true);
    assert.match(pair.song_a_id, /^open-/);
    assert.match(pair.song_b_id, /^open-/);
    await sql(
      asUser(
        2,
        `select submit_rank_vote('${issued.comparisonId}','${pair.song_a_id}')`,
      ),
    );
    const next = JSON.parse(await sql(asUser(2, "select get_rank_state()")));
    assert.equal(next.preview_only, true);
    assert.ok(![pair.song_a_id, pair.song_b_id].includes(next.song_a_id));
    assert.equal(await sql("select count(*) from rank_votes"), "1");
    assert.equal(await sql("select count(*) from rating_events"), "1");
    assert.equal(await sql("select count(*) from votes"), "0");
    await sql(asUser(2, "select start_rank_pair()"));
    assert.equal(
      JSON.parse(await sql(asUser(2, "select get_rank_state()"))).preview_only,
      false,
    );
    await assert.rejects(
      sql(asUser(2, "select prepare_rank_pair(true)")),
      /permission denied/,
    );
  });
  await test("Daily scheduling and atomic voting accept authorized audio-only recordings and reject unavailable audio", async () => {
    await sql(
      "delete from daily_matchups where not exists(select 1 from votes where matchup_id=daily_matchups.id)",
    );
    const days = [
      {
        day: new Date().toISOString().slice(0, 10),
        songA: sources[0].songId,
        songB: sources[1].songId,
      },
    ];
    await sql(asUser(1, `select schedule_matchup_batch(${literal(days)})`));
    const id = await sql("select matchup_id from get_today_matchup()");
    await sql(
      asUser(2, `select submit_daily_vote('${id}','${sources[0].songId}')`),
    );
    assert.equal(await sql("select count(*) from votes"), "1");
    assert.equal(
      await sql(`select total_votes from profiles where user_id='${user(2)}'`),
      "1",
    );
    await sql(
      `update song_audio_sources set availability='unavailable' where song_id='${sources[1].songId}'`,
    );
    const before = await sql(
      "select jsonb_agg(to_jsonb(s) order by id) from songs s",
    );
    await assert.rejects(
      sql(
        asUser(1, `select submit_daily_vote('${id}','${sources[0].songId}')`),
      ),
      /Playback is unavailable/,
    );
    assert.equal(
      await sql("select jsonb_agg(to_jsonb(s) order by id) from songs s"),
      before,
    );
  });
} finally {
  db.close();
}
console.log(`${passed} audio database cases passed.`);
