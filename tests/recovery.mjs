import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  user,
  asUser,
  day,
  createDay,
} from "./database-harness.mjs";

const db = databaseHarness("recovery"),
  { sql } = db;
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const sources = () =>
  sql(`select jsonb_build_object(
  'users',(select jsonb_agg(to_jsonb(r) order by id) from auth.users r),
  'profiles',(select jsonb_agg(to_jsonb(r) order by user_id) from profiles r),
  'votes',(select jsonb_agg(to_jsonb(r) order by id) from votes r),
  'events',(select jsonb_agg(to_jsonb(r) order by id) from rating_events r),
  'activity',(select jsonb_agg(to_jsonb(r) order by vote_id) from user_daily_activity r))`);
const derived = async () =>
  JSON.parse(
    await sql(`select jsonb_build_object(
  'songs',(select jsonb_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs) r),
  'matchups',(select jsonb_agg(r order by matchup_day) from(select id,matchup_day,song_a_votes,song_b_votes from daily_matchups) r),
  'snapshots',(select jsonb_agg(r order by song_id,snapshot_date) from(select song_id,snapshot_date,rating,rank from song_rating_snapshots) r))`),
  );
const audit = () =>
  sql("select jsonb_agg(to_jsonb(r) order by id) from admin_audit_log r");
async function waitFor(predicate) {
  for (let i = 0; i < 40; i++)
    if (
      (await sql(
        `select exists(select 1 from pg_stat_activity where datname=current_database() and ${predicate})`,
      )) === "t"
    )
      return;
  assert.fail(`Did not observe database synchronization point: ${predicate}`);
}
try {
  await db.create();
  await db.migrate();
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(`insert into auth.users(id,email) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'recovery'||n||'@example.test' from generate_series(1,5) n;
    update profiles set role='admin' where user_id='${user(1)}';delete from daily_matchups;
    ${createDay(-2)};${createDay(-1, "dreams-fleetwood-mac", "respect-aretha")};${createDay(0, "god-only-knows", "dreams-fleetwood-mac")};`);

  // Independent three-day fixture: equal ratings +12; 1500 beats 1512 at K=32 => +17;
  // 1488 beats 1517 at K=16 => +9. Final ratings are 1495,1497,1508 (sum 4500).
  const fixtures = [
    {
      offset: -2,
      account: 2,
      a: "respect-aretha",
      b: "god-only-knows",
      winner: "respect-aretha",
      loser: "god-only-knows",
      before: 1500,
      opponent: 1500,
      delta: 12,
      k: 24,
    },
    {
      offset: -1,
      account: 2,
      a: "dreams-fleetwood-mac",
      b: "respect-aretha",
      winner: "dreams-fleetwood-mac",
      loser: "respect-aretha",
      before: 1500,
      opponent: 1512,
      delta: 17,
      k: 32,
    },
    {
      offset: 0,
      account: 3,
      a: "god-only-knows",
      b: "dreams-fleetwood-mac",
      winner: "god-only-knows",
      loser: "dreams-fleetwood-mac",
      before: 1488,
      opponent: 1517,
      delta: 9,
      k: 16,
    },
  ];
  for (const [i, f] of fixtures.entries()) {
    const vid = `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    await sql(`insert into votes(id,user_id,matchup_id,song_a_id,song_b_id,selected_song_id,rejected_song_id,
      selected_rating_before,rejected_rating_before,selected_rating_after,rejected_rating_after,expected_score,rating_delta,created_at)
      select '${vid}','${user(f.account)}',id,'${f.a}','${f.b}','${f.winner}','${f.loser}',${f.before},${f.opponent},${f.before + f.delta},${f.opponent - f.delta},
      1/(1+power(10,(${f.opponent}::numeric-${f.before})/400)),${f.delta},starts_at+interval '1 hour' from daily_matchups where matchup_day=${day}+${f.offset};
      insert into rating_events(vote_id,winner_song_id,loser_song_id,winner_before,loser_before,winner_after,loser_after,k_factor,created_at)
      select id,selected_song_id,rejected_song_id,selected_rating_before,rejected_rating_before,selected_rating_after,rejected_rating_after,${f.k},created_at from votes where id='${vid}';
      insert into user_daily_activity(user_id,activity_day,vote_id) values('${user(f.account)}',${day}+${f.offset},'${vid}')`);
  }
  await sql(`update songs set elo_rating=case id when 'respect-aretha' then 1495 when 'god-only-knows' then 1497 else 1508 end,wins=1,losses=1,matchup_count=2
      where id in('respect-aretha','god-only-knows','dreams-fleetwood-mac');
    update daily_matchups set song_a_votes=1,song_b_votes=0;
    update profiles set total_votes=2,last_vote_day=${day}-1,current_streak=2,longest_streak=2 where user_id='${user(2)}';
    update profiles set total_votes=1,last_vote_day=${day},current_streak=1,longest_streak=1 where user_id='${user(3)}';
    insert into song_rating_snapshots(song_id,snapshot_date,rating) values
      ('respect-aretha',${day}-2,1512),('god-only-knows',${day}-2,1488),
      ('respect-aretha',${day}-1,1495),('dreams-fleetwood-mac',${day}-1,1517),
      ('god-only-knows',${day},1497),('dreams-fleetwood-mac',${day},1508);
    update app_settings set elo_k_factor=100`);

  await test("multi-day recovery restores exact ratings, counters and snapshots using historical K factors", async () => {
    const expected = await derived(),
      original = await sources();
    await sql(
      "update songs set elo_rating=9999,wins=0,losses=0,matchup_count=0;update daily_matchups set song_a_votes=777,song_b_votes=555;update song_rating_snapshots set rating=-999",
    );
    assert.equal(await sql(asUser(1, "select rebuild_rankings()")), "3");
    assert.deepEqual(await derived(), expected);
    assert.equal(await sources(), original);
    assert.equal(await sql(asUser(1, "select rebuild_rankings()")), "3");
    assert.deepEqual(await derived(), expected);
    assert.equal(await sources(), original);
  });

  await test("missing events, mismatched values, wrong historical K and missing activity stop recovery atomically", async () => {
    const event = await sql(
      "select to_jsonb(e) from rating_events e where k_factor=24",
    );
    const cases = [
      [
        "update rating_events set winner_before=winner_before+1,winner_after=winner_after+1 where k_factor=24",
        "update rating_events set winner_before=winner_before-1,winner_after=winner_after-1 where k_factor=24",
      ],
      [
        "update rating_events set k_factor=25 where k_factor=24",
        "update rating_events set k_factor=24 where k_factor=25",
      ],
      [
        "delete from rating_events where k_factor=24",
        `insert into rating_events select * from jsonb_populate_record(null::rating_events,${literal(event)})`,
      ],
      [
        `update user_daily_activity set activity_day=activity_day-5 where vote_id='20000000-0000-4000-8000-000000000001'`,
        `update user_daily_activity set activity_day=activity_day+5 where vote_id='20000000-0000-4000-8000-000000000001'`,
      ],
    ];
    for (const [corrupt, restore] of cases) {
      await sql(corrupt);
      try {
        const before = [await derived(), await sources(), await audit()];
        await assert.rejects(
          sql(asUser(1, "select rebuild_rankings()")),
          /Audit records are inconsistent/,
        );
        assert.deepEqual(
          [await derived(), await sources(), await audit()],
          before,
        );
      } finally {
        await sql(restore);
      }
    }
  });

  await test("recovery waits for an in-flight vote and then includes it exactly once", async () => {
    const voting = sql(
      `--phase3-held-vote\n${asUser(4, "set local application_name='phase3-held-vote';select submit_daily_vote((select matchup_id from get_today_matchup()),'god-only-knows');select pg_sleep(5)")}`,
    );
    await waitFor(
      "wait_event='PgSleep' and application_name='phase3-held-vote'",
    );
    const rebuilding = sql(
      `--phase3-waiting-rebuild\n${asUser(1, "set local application_name='phase3-waiting-rebuild';select rebuild_rankings()")}`,
    );
    await waitFor(
      "wait_event_type='Lock' and application_name='phase3-waiting-rebuild'",
    );
    await voting;
    assert.equal(await rebuilding, "4");
    assert.equal(await sql("select count(*) from votes"), "4");
    assert.equal(await sql("select count(*) from rating_events"), "4");
    assert.equal(await sql("select sum(elo_rating) from songs"), "30000.00");
  });

  await test("an in-flight recovery blocks voting safely and subsequent replay is idempotent", async () => {
    const rebuilding = sql(
      `--phase3-held-rebuild\n${asUser(1, "set local application_name='phase3-held-rebuild';select rebuild_rankings();select pg_sleep(5)")}`,
    );
    await waitFor(
      "wait_event='PgSleep' and application_name='phase3-held-rebuild'",
    );
    const voting = sql(
      `--phase3-waiting-vote\n${asUser(5, "set local application_name='phase3-waiting-vote';select submit_daily_vote((select matchup_id from get_today_matchup()),'dreams-fleetwood-mac')")}`,
    );
    await waitFor(
      "wait_event_type='Lock' and application_name='phase3-waiting-vote'",
    );
    await rebuilding;
    await voting;
    const expected = await derived(),
      original = await sources();
    assert.equal(await sql(asUser(1, "select rebuild_rankings()")), "5");
    assert.deepEqual(await derived(), expected);
    assert.equal(await sources(), original);
    assert.equal(await sql("select sum(elo_rating) from songs"), "30000.00");
  });
  console.log(`${passed} Phase 3 recovery tests passed.`);
} finally {
  db.close();
}
