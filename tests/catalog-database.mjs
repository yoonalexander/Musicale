import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  migrations,
  asUser,
  user,
} from "./database-harness.mjs";
import { normalizeRecording } from "../lib/music-catalog.ts";
const records = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8"));
const candidates = records.map(normalizeRecording);
const metadataOnly = {
  ...candidates[0],
  song: {
    ...candidates[0].song,
    providers: candidates[0].song.providers.filter(
      (p) => p.provider === "musicbrainz",
    ),
  },
};
const literal = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const db = databaseHarness("catalog"),
  { sql } = db;
const ingest = (items, actor = 1) =>
  sql(asUser(actor, `select ingest_catalog(${literal(items)})`));
const callAudio = (preview, actor = 1) =>
  sql(
    asUser(
      actor,
      `select save_audio_source('respect-aretha',${literal(preview)})`,
    ),
  );
let passed = 0;
async function test(name, run) {
  await run();
  console.log(`PASS ${name}`);
  passed++;
}
const core = () =>
  sql(`select jsonb_build_object(
  'ratings',(select jsonb_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs where id not like 'mb-%') r),
  'votes',(select jsonb_agg(to_jsonb(v) order by id) from votes v),
  'events',(select jsonb_agg(to_jsonb(e)-array['event_order','rank_vote_id'] order by id) from rating_events e),
  'activity',(select jsonb_agg(to_jsonb(a) order by vote_id) from user_daily_activity a),
  'days',(select jsonb_agg(to_jsonb(m) order by id) from daily_matchups m))`);
try {
  await db.create();
  const files = migrations();
  await db.migrate(files.slice(0, 9));
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(`insert into auth.users values('${user(1)}','owner@example.test'),('${user(2)}','listener@example.test');
    update profiles set role='admin' where user_id='${user(1)}';
    insert into product_event_counts values(current_date,'preview_started',3),(current_date,'daily_view',2)`);
  await sql(
    asUser(
      2,
      "select submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
    ),
  );
  const before = await core();
  await test("0009 to 0010 preserves the twenty songs, providers, actual votes, Elo and scheduled matchups", async () => {
    const songs = await sql(
      "select jsonb_agg(to_jsonb(s) order by id) from songs s",
    );
    const providers = await sql(
      "select jsonb_agg(to_jsonb(p) order by id) from song_providers p",
    );
    await db.migrate(files.slice(9));
    assert.equal(await core(), before);
    assert.equal(
      await sql(
        "select jsonb_agg(to_jsonb(s)-array['catalog_managed_fields','artwork_source_url','artwork_attribution','metadata_details'] order by id) from songs s",
      ),
      songs,
    );
    assert.equal(
      await sql(
        "select jsonb_agg(to_jsonb(p) order by id) from song_providers p",
      ),
      providers,
    );
    assert.equal(await sql("select count(*) from songs"), "20");
    assert.equal(
      await sql(
        "select count from product_event_counts where event='listening_link_clicked'",
      ),
      "3",
    );
  });
  await test("metadata-only duplicates require review; attaching preserves existing IDs, links and editorial metadata", async () => {
    await assert.rejects(ingest([metadataOnly]), /Review possible duplicates/);
    const reviewed = JSON.parse(
      await sql(
        asUser(1, `select catalog_duplicates(${literal([metadataOnly])})`),
      ),
    );
    assert.deepEqual(reviewed[0].matches, [
      { song_id: "respect-aretha", reason: "metadata" },
    ]);
    const normalized = structuredClone(metadataOnly);
    normalized.song.title = "Ｒｅｓｐｅｃｔ!";
    normalized.song.artistName = "ARETHA  FRANKLIN";
    const unicodeMatches = JSON.parse(
      await sql(
        asUser(1, `select catalog_duplicates(${literal([normalized])})`),
      ),
    );
    assert.equal(unicodeMatches[0].matches[0].song_id, "respect-aretha");
    const providerMatches = JSON.parse(
      await sql(
        asUser(1, `select catalog_duplicates(${literal([candidates[0]])})`),
      ),
    );
    assert.equal(providerMatches[0].matches[0].reason, "identifier");
    assert.deepEqual(
      JSON.parse(
        await ingest([{ ...metadataOnly, targetSongId: "respect-aretha" }]),
      ).songIds,
      ["respect-aretha"],
    );
    assert.equal(
      await sql(
        "select release_date is null and catalog_managed_fields='{}' and status='active' from songs where id='respect-aretha'",
      ),
      "t",
    );
    assert.equal(
      await sql(
        "select provider_song_id from song_providers where song_id='respect-aretha' and provider='youtube'",
      ),
      "JzqGZjFnYnA",
    );
    assert.equal(await core(), before);
  });
  await test("concurrent repeated imports are idempotent and refresh only fields managed by discovery", async () => {
    await Promise.all([ingest([candidates[1]]), ingest([candidates[1]])]);
    const id = candidates[1].song.id;
    assert.equal(await sql(`select count(*) from songs where id='${id}'`), "1");
    const refreshed = structuredClone(candidates[1]);
    refreshed.song.albumName = "Updated fixture album";
    await ingest([refreshed]);
    assert.equal(
      await sql(`select album_name||','||status from songs where id='${id}'`),
      "Updated fixture album,unavailable",
    );
    await sql(
      asUser(
        1,
        `update songs set title='Editorial title',genre='Editorial genre' where id='${id}'`,
      ),
    );
    refreshed.song.title = "Changed upstream title";
    refreshed.song.albumName = "Latest fixture album";
    await ingest([refreshed]);
    assert.equal(
      await sql(
        `select title||','||genre||','||album_name from songs where id='${id}'`,
      ),
      "Editorial title,Editorial genre,Latest fixture album",
    );
    await sql(
      asUser(
        1,
        `select save_catalog(${literal([{ ...refreshed.song, id, title: "Manual import", status: "unavailable" }])})`,
      ),
    );
    refreshed.song.albumName = "Must not overwrite manual import";
    await ingest([refreshed]);
    assert.equal(
      await sql(
        `select title||','||album_name||','||cardinality(catalog_managed_fields) from songs where id='${id}'`,
      ),
      "Manual import,Latest fixture album,0",
    );
  });
  await test("ISRC matches preserve identity; contradictory identifiers and invalid batches roll back completely", async () => {
    const alternative = structuredClone(candidates[1]);
    alternative.providerId = "77777777-7777-4777-8777-777777777777";
    alternative.sourceUrl = `https://musicbrainz.org/recording/${alternative.providerId}`;
    alternative.song.id = `mb-${alternative.providerId}`;
    alternative.song.providers = [
      {
        provider: "musicbrainz",
        providerSongId: alternative.providerId,
        externalUrl: alternative.sourceUrl,
      },
    ];
    assert.deepEqual(JSON.parse(await ingest([alternative])).songIds, [
      candidates[1].song.id,
    ]);
    assert.equal(await sql("select count(*) from songs"), "21");
    const conflict = structuredClone(candidates[0]);
    conflict.isrcs = candidates[1].isrcs;
    await assert.rejects(ingest([conflict]), /Conflicting identifiers/);
    const snapshot = await sql(
      "select jsonb_agg(to_jsonb(s) order by provider_song_id) from catalog_sources s",
    );
    const invalid = structuredClone(alternative);
    invalid.isrcs = ["not-an-isrc"];
    await assert.rejects(ingest([candidates[1], invalid]), /Invalid ISRC/);
    const yearless = structuredClone(candidates[1]);
    yearless.song.releaseYear = null;
    await assert.rejects(ingest([yearless]), /Invalid discovery candidate/);
    assert.equal(
      await sql(
        "select jsonb_agg(to_jsonb(s) order by provider_song_id) from catalog_sources s",
      ),
      snapshot,
    );
    assert.equal(await core(), before);
  });
  await test("catalog source data, imports, preview edits and provider request slots require admin authorization", async () => {
    for (const expression of [
      `select ingest_catalog(${literal([candidates[1]])})`,
      `select catalog_duplicates('[]')`,
      "select reserve_catalog_provider_call()",
      "select save_audio_source('respect-aretha','{}')",
    ])
      await assert.rejects(sql(asUser(2, expression)), /Admin access required/);
    await assert.rejects(
      sql("set role anon;select ingest_catalog('[]')"),
      /permission denied/,
    );
    assert.equal(
      await sql(asUser(2, "select count(*) from catalog_sources")),
      "0",
    );
    await assert.rejects(
      sql(asUser(1, "update catalog_sources set metadata='{}'")),
      /permission denied/,
    );
    const slots = await Promise.all([
      sql(asUser(1, "select reserve_catalog_provider_call()")),
      sql(asUser(1, "select reserve_catalog_provider_call()")),
    ]);
    assert.deepEqual(slots.sort(), ["f", "t"]);
  });
  await test("only available and explicitly authorized audio is public; missing evidence fails atomically", async () => {
    await sql("delete from request_budgets where action='admin'");
    const preview = {
      provider: "Fixture license",
      url: "https://audio.example.test/preview.wav",
      availability: "available",
      licensingStatus: "unreviewed",
      authorizationUrl: null,
      attribution: "Fixture artist",
    };
    await callAudio(preview);
    assert.equal(
      await sql("set role anon;select count(*) from song_audio_sources"),
      "0",
    );
    await assert.rejects(
      callAudio({ ...preview, licensingStatus: "authorized" }),
      /Audio could not be saved/,
    );
    const authorized = {
      ...preview,
      licensingStatus: "authorized",
      authorizationUrl: "https://audio.example.test/license",
    };
    await callAudio(authorized);
    assert.equal(
      await sql("set role anon;select count(*) from song_audio_sources"),
      "1",
    );
    await assert.rejects(
      sql("set role anon;select reviewed_by from song_audio_sources"),
      /permission denied/,
    );
    assert.equal(
      await sql(
        "set role anon;select audio_preview->>'licensing_status' from song_catalog where id='respect-aretha'",
      ),
      "authorized",
    );
    await callAudio({ ...authorized, availability: "unavailable" });
    assert.equal(
      await sql(
        "set role anon;select audio_preview is null from song_catalog where id='respect-aretha'",
      ),
      "t",
    );
    assert.equal(
      await sql(
        "select count(*)>0 from admin_audit_log where entity='song_audio_sources' and entity_id='respect-aretha'",
      ),
      "t",
    );
    assert.equal(await core(), before);
  });
  await test("listening clicks and confirmed playback have separate aggregate counts, including legacy clients", async () => {
    await sql(
      asUser(
        2,
        "select record_product_event('preview_started');select record_product_event('preview_play_started');select record_product_event('preview_play_failed')",
      ),
    );
    assert.equal(
      await sql(
        "select count from product_event_counts where event='listening_link_clicked'",
      ),
      "4",
    );
    assert.equal(
      await sql(
        "select count(*) from product_event_counts where event='preview_started'",
      ),
      "0",
    );
    assert.equal(
      await sql(
        "select sum(count) from product_event_counts where event in('preview_play_started','preview_play_failed')",
      ),
      "2",
    );
  });
} finally {
  db.close();
}
console.log(`${passed} catalog database cases passed.`);
