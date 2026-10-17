import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  databaseHarness,
  migrations,
  user,
  asUser,
} from "./database-harness.mjs";

const files = migrations(),
  seed = readFileSync("supabase/seed.sql", "utf8");
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
// Filled from Git commit 96ab7d7, normalized to LF for Windows/Linux parity.
const historicalHashes = {
  "0009_live_rankings.sql":
    "94aa73b652f1df38cbf38319b0f3b83a3522680d22764e9ea71c5b562a95686d",
  "0008_transactional_boundaries.sql":
    "d47b6aa8c184cd4f4964f91c3ea4cf88520a08d8c0d117a070a1f20dfb7fbb19",
  "0001_initial.sql":
    "0e20da248ad4279e08f04c9356d30daa295e8c0640132efc09d9ce5ddc8f0d45",
  "0002_daily_musicale.sql":
    "64eee2b87381523898164a5c7c63545822aa70b06f97e90cd9b1e477cc3da3f4",
  "0003_daily_flow.sql":
    "b10bb6dbe771e39b0075c0e96b03ee823aac5b307d5d3dcf8a38755283122acd",
  "0004_complete_product.sql":
    "9420a228fa2e30a6c5335a80f5728ff9c49a4a3c22d5bf1250ce2183be76756e",
  "0005_editorial_scheduling.sql":
    "983e41ec20fec3fa202aa5b50d86babd0de634036be05afea2052f7ffed92739",
  "0006_retention_indexes.sql":
    "26c85510507432c3e6dd767e85d0aa991395e95e40f9bf468f661c95fa5d712a",
  "0007_display_name_limit.sql":
    "02ffe961646f4d206cffb7446fe76eb1901c791ff5f8d9ff29e4247c9cad44e7",
};
const sourceState = (sql) =>
  sql(`select jsonb_build_object(
  'users',(select jsonb_agg(to_jsonb(r) order by id) from auth.users r),
  'profiles',(select jsonb_agg(to_jsonb(r) order by user_id) from profiles r),
  'votes',(select jsonb_agg(to_jsonb(r) order by id) from votes r),
  'events',(select jsonb_agg(to_jsonb(r)-array['event_order','rank_vote_id'] order by id) from rating_events r),
  'activity',(select jsonb_agg(to_jsonb(r) order by vote_id) from user_daily_activity r),
  'ratings',(select jsonb_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs) r),
  'days',(select jsonb_agg(r order by id) from(select id,matchup_day,song_a_id,song_b_id,song_a_votes,song_b_votes from daily_matchups) r))`);
async function tracked(sql) {
  assert.equal(
    await sql(
      "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations",
    ),
    migrations()
      .map((file) => file.split("_")[0])
      .join(","),
  );
  await assert.rejects(
    sql(
      "set role authenticated;select * from supabase_migrations.schema_migrations",
    ),
    /permission denied/,
  );
}

await test("historical migrations remain byte-for-byte unchanged after LF normalization", async () => {
  for (const [file, expected] of Object.entries(historicalHashes))
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync("supabase/migrations/" + file, "utf8").replaceAll(
            "\r\n",
            "\n",
          ),
        )
        .digest("hex"),
      expected,
      file,
    );
});

await test("fresh database applies every migration, tracks versions privately and preserves repeated seed data", async () => {
  const db = databaseHarness("fresh"),
    { sql } = db;
  try {
    await db.create();
    await db.migrate();
    await sql(seed);
    await sql(
      `insert into auth.users(id,email) values('${user(1)}','fresh@example.test')`,
    );
    await sql(
      asUser(
        1,
        "select submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
      ),
    );
    const before = await sourceState(sql);
    await sql(seed);
    assert.equal(await sourceState(sql), before);
    assert.equal(await sql("select count(*) from songs"), "20");
    assert.equal(await sql("select count(*) from song_providers"), "20");
    await tracked(sql);
    assert.equal(
      await sql(
        "select prorettype::regtype from pg_proc where oid='update_my_display_name(text)'::regprocedure",
      ),
      "jsonb",
    );
  } finally {
    db.close();
  }
});

await test("legacy upgrade preserves identities, roles, join dates and all archived product records", async () => {
  const db = databaseHarness("legacy"),
    { sql } = db;
  try {
    await db.create();
    await db.migrate(files.slice(0, 1));
    await sql(`insert into auth.users(id,email) values('${user(1)}','legacy@example.test');
      update profiles set display_name='Legacy listener',role='admin',created_at='2001-01-01T00:00:00Z' where user_id='${user(1)}';
      insert into songs(id,title,musical_title,category,artist_label,release_year) values('old-a','Old A','Old show','broadway','Old artist',2000),('old-b','Old B','Old show','broadway','Old artist',2001);
      insert into votes(user_id,left_song_id,right_song_id,winner_song_id,loser_song_id,rating_delta_winner,rating_delta_loser) values('${user(1)}','old-a','old-b','old-a','old-b',12,-12);
      insert into game_runs(user_id,score,started_at,ended_at) values('${user(1)}',7,'2001-01-01T01:00:00Z','2001-01-01T01:02:00Z');
      insert into daily_vote_usage values('${user(1)}','2001-01-01',3)`);
    const archives = {};
    for (const table of [
      "songs",
      "votes",
      "profiles",
      "game_runs",
      "daily_vote_usage",
    ])
      archives[table] = await sql(
        `select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from ${table} r`,
      );
    await db.migrate(files.slice(1));
    await sql(seed);
    await tracked(sql);
    for (const [table, before] of Object.entries(archives)) {
      assert.equal(
        await sql(
          `select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from musicale_legacy.${table} r`,
        ),
        before,
      );
      await assert.rejects(
        sql(asUser(1, `select * from musicale_legacy.${table}`)),
        /permission denied/,
      );
    }
    assert.equal(
      await sql(
        `select display_name||','||role||','||extract(year from created_at)::int from profiles where user_id='${user(1)}'`,
      ),
      "Legacy listener,admin,2001",
    );
    assert.equal(
      await sql(
        "select to_regprocedure('public.submit_rank_vote(text,text,text)') is null",
      ),
      "t",
    );
    assert.equal(await sql("select count(*) from votes"), "0");
  } finally {
    db.close();
  }
});

for (const cutoff of [3, 7])
  await test(`incremental upgrade from 000${cutoff} preserves votes, events, roles, profiles and tracking`, async () => {
    const db = databaseHarness(cutoff === 3 ? "daily" : "incremental"),
      { sql } = db;
    try {
      await db.create();
      await db.migrate(files.slice(0, cutoff));
      await sql(seed);
      await sql(`insert into auth.users(id,email) values('${user(1)}','owner@example.test'),('${user(2)}','listener@example.test');
      update profiles set role='admin',display_name='Owner' where user_id='${user(1)}'`);
      await sql(
        asUser(
          2,
          "select submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
        ),
      );
      const before = await sourceState(sql);
      const tracking = await sql(
        `select jsonb_agg(to_jsonb(r) order by version) from supabase_migrations.schema_migrations r where version<='000${cutoff}'`,
      );
      await db.migrate(files.slice(cutoff));
      assert.equal(await sourceState(sql), before);
      assert.equal(
        await sql(
          `select jsonb_agg(to_jsonb(r) order by version) from supabase_migrations.schema_migrations r where version<='000${cutoff}'`,
        ),
        tracking,
      );
      await tracked(sql);
      assert.equal(
        await sql(
          "select string_agg(schemaname||'.'||tablename,',' order by schemaname,tablename) from pg_publication_tables where pubname='supabase_realtime'",
        ),
        "public.songs",
      );
      assert.equal(
        await sql(
          "select bool_and(relrowsecurity) from pg_class where oid='public.songs'::regclass",
        ),
        "t",
      );
      assert.equal(
        await sql("select has_table_privilege('anon','public.songs','select')"),
        "t",
      );
      await sql(seed);
      assert.equal(await sourceState(sql), before);
      await assert.rejects(
        sql(asUser(2, "select process_daily_vote(null,'respect-aretha')")),
        /permission denied/,
      );
      await assert.rejects(
        sql(
          asUser(
            2,
            "select submit_daily_vote((select matchup_id from get_today_matchup()),'god-only-knows')",
          ),
        ),
        /already voted/,
      );
      assert.equal(await sourceState(sql), before);
    } finally {
      db.close();
    }
  });
console.log(`${passed} Phase 3 migration tests passed.`);
