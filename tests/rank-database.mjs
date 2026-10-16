import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  migrations,
  user,
  asUser,
} from "./database-harness.mjs";
const db = databaseHarness("rank"),
  { sql } = db;
let passed = 0;
async function test(name, run) {
  await run();
  console.log(`PASS ${name}`);
  passed++;
}
const start = async (n) =>
  JSON.parse(await sql(asUser(n, "select start_rank_pair()"))).comparisonId;
const state = async (n) => {
  const value = await sql(asUser(n, "select get_rank_state()"));
  return value ? JSON.parse(value) : null;
};
const vote = (n, id, choice) =>
  sql(asUser(n, `select submit_rank_vote('${id}','${choice}')`)).then(
    JSON.parse,
  );
const daily = () =>
  sql(`select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from profiles p),
 'votes',(select jsonb_agg(to_jsonb(v) order by id) from votes v),'days',(select jsonb_agg(to_jsonb(m) order by id) from daily_matchups m),
 'activity',(select jsonb_agg(to_jsonb(a) order by vote_id) from user_daily_activity a))`);
const sources = () =>
  sql(`select jsonb_build_object('daily',(select jsonb_agg(to_jsonb(v) order by id) from votes v),
 'rank',(select jsonb_agg(to_jsonb(v) order by id) from rank_votes v), 'comparisons',(select jsonb_agg(to_jsonb(c) order by id) from rank_comparisons c),
 'events',(select jsonb_agg(to_jsonb(e) order by event_order) from rating_events e),'profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from profiles p),
 'activity',(select jsonb_agg(to_jsonb(a) order by vote_id) from user_daily_activity a))`);
const derived = () =>
  sql(`select jsonb_build_object('songs',(select jsonb_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs) r),
 'days',(select jsonb_agg(r order by id) from(select id,song_a_votes,song_b_votes from daily_matchups) r),
 'snapshots',(select jsonb_agg(r order by song_id,snapshot_date) from(select song_id,snapshot_date,rating,rank from song_rating_snapshots) r))`);
const budget = (n) =>
  sql(
    `select coalesce(sum(attempts),0) from request_budgets where user_id='${user(n)}' and action='rank'`,
  );
const resetBudget = (n) =>
  sql(
    `delete from request_budgets where user_id='${user(n)}' and action='rank'`,
  );
const core = () =>
  sql(`select jsonb_build_object('songs',(select jsonb_agg(to_jsonb(s) order by id) from songs s),
 'providers',(select jsonb_agg(to_jsonb(p) order by id) from song_providers p),
 'votes',(select jsonb_agg(to_jsonb(v) order by id) from votes v),
 'events',(select jsonb_agg(to_jsonb(e)-array['event_order','rank_vote_id'] order by id) from rating_events e),
 'profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from profiles p),
 'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from song_rating_snapshots s))`);
async function waitFor(predicate) {
  for (let i = 0; i < 50; i++)
    if (
      (await sql(
        `select exists(select 1 from pg_stat_activity where datname=current_database() and ${predicate})`,
      )) === "t"
    )
      return;
  assert.fail("Missing synchronization point " + predicate);
}
try {
  await db.create();
  const files = migrations(),
    rankIndex = files.findIndex((f) => f.startsWith("0012_"));
  await db.migrate(files.slice(0, rankIndex));
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'rank'||n||'@example.test' from generate_series(1,70) n;
 update profiles set role='admin' where user_id='${user(1)}'`);
  await sql(
    asUser(
      2,
      "select submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
    ),
  );
  await sql(
    asUser(
      3,
      "select submit_daily_vote((select matchup_id from get_today_matchup()),'god-only-knows')",
    ),
  );
  await sql(
    "update rating_events set created_at=case when winner_song_id='respect-aretha' then now()+interval '1 hour' else now()-interval '1 hour' end",
  );
  await test("Rank migration preserves populated catalog, Daily votes, profiles and snapshots and orders legacy events causally", async () => {
    const before = await core();
    await sql(
      "update rating_events set winner_before=winner_before+1 where winner_song_id='respect-aretha'",
    );
    await assert.rejects(
      db.migrate(files.slice(rankIndex)),
      /could not be ordered consistently/,
    );
    assert.equal(await sql("select to_regclass('rank_votes') is null"), "t");
    assert.equal(
      await sql(
        "select count(*) from information_schema.columns where table_name='rating_events' and column_name='event_order'",
      ),
      "0",
    );
    await sql(
      "update rating_events set winner_before=winner_before-1 where winner_song_id='respect-aretha'",
    );
    assert.equal(await core(), before);
    await db.migrate(files.slice(rankIndex));
    assert.equal(await core(), before);
    assert.equal(
      await sql(
        "select string_agg(winner_song_id,',' order by event_order) from rating_events",
      ),
      "respect-aretha,god-only-knows",
    );
    assert.equal(await sql("select count(*) from songs"), "20");
  });
  await test("issuance is private and idempotent; reads cannot reroll or consume Rank budget", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => start(4)));
    assert.equal(new Set(ids).size, 1);
    const before = await budget(4),
      c = await state(4);
    assert.equal(c.id, ids[0]);
    assert.notEqual(c.song_a_id, c.song_b_id);
    assert.equal((await state(4)).id, c.id);
    assert.equal(await budget(4), before);
    assert.equal(
      await sql(asUser(5, "select count(*) from rank_comparisons")),
      "0",
    );
    for (const name of [
      "rank_comparisons",
      "rank_votes",
      "rating_vote_sources",
    ]) {
      await assert.rejects(
        sql(`set role anon;select * from ${name}`),
        /permission denied/,
      );
    }
    await assert.rejects(
      sql(asUser(4, "select * from rating_vote_sources")),
      /permission denied/,
    );
    await assert.rejects(
      sql(asUser(4, "select prepare_rank_pair()")),
      /permission denied/,
    );
    await assert.rejects(
      sql(asUser(4, "select rank_song_playable('respect-aretha')")),
      /permission denied/,
    );
    await assert.rejects(
      sql(asUser(4, "select nextval('rating_event_order_seq')")),
      /permission denied/,
    );
    await assert.rejects(
      sql(asUser(4, "delete from rank_comparisons")),
      /permission denied/,
    );
    await assert.rejects(
      sql("set role anon;select start_rank_pair()"),
      /permission denied/,
    );
    assert.equal(
      await sql(
        "select string_agg(tablename,',' order by tablename) from pg_publication_tables where pubname='supabase_realtime'",
      ),
      "songs",
    );
  });
  await test("a preference atomically updates shared Elo/audit/snapshots and replaces both songs without touching Daily", async () => {
    const c = await state(4),
      beforeDaily = await daily();
    const ratings = JSON.parse(
      await sql(
        `select jsonb_object_agg(id,elo_rating) from songs where id in('${c.song_a_id}','${c.song_b_id}')`,
      ),
    );
    const expected = Math.round(
      24 *
        (1 -
          1 /
            (1 +
              10 **
                ((Number(ratings[c.song_b_id]) - Number(ratings[c.song_a_id])) /
                  400))),
    );
    const v = await vote(4, c.id, c.song_a_id);
    assert.equal(v.ratingDelta, expected);
    assert.equal(v.replayed, false);
    const next = await state(4);
    assert(next);
    assert(![c.song_a_id, c.song_b_id].includes(next.song_a_id));
    assert(![c.song_a_id, c.song_b_id].includes(next.song_b_id));
    assert.equal(
      await sql(`select elo_rating from songs where id='${c.song_a_id}'`),
      (Number(ratings[c.song_a_id]) + expected).toFixed(2),
    );
    assert.equal(
      await sql(
        `select count(*) from rating_events where rank_vote_id='${v.voteId}'`,
      ),
      "1",
    );
    assert.equal(await daily(), beforeDaily);
    assert.equal(await sql("select sum(elo_rating) from songs"), "30000.00");
    const before = await sources();
    const replay = await vote(4, c.id, c.song_a_id);
    assert.equal(replay.voteId, v.voteId);
    assert(replay.replayed);
    assert.equal(await sources(), before);
    await assert.rejects(vote(4, c.id, c.song_b_id), /saved choice/);
  });
  await test("opposite-choice and duplicate races accept one preference and never advance twice", async () => {
    await start(5);
    const c = await state(5);
    const beforeDaily = await daily();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        vote(5, c.id, i % 2 ? c.song_a_id : c.song_b_id),
      ),
    );
    assert.equal(
      outcomes.filter((r) => r.status === "fulfilled" && !r.value.replayed)
        .length,
      1,
    );
    assert.equal(
      await sql(
        `select count(*) from rank_votes where comparison_id='${c.id}'`,
      ),
      "1",
    );
    assert.equal(
      await sql(
        `select count(*) from rank_comparisons where user_id='${user(5)}' and status='pending'`,
      ),
      "1",
    );
    assert.equal(await daily(), beforeDaily);
    assert.equal(await budget(5), "11");
  });
  await test("ownership, membership, expiry and changed availability reject safely and consume attempts", async () => {
    await start(6);
    let c = await state(6);
    let before = [await sources(), await derived()];
    let attempts = Number(await budget(6));
    await assert.rejects(vote(6, c.id, "not-in-pair"), /Choose a song/);
    assert.deepEqual([await sources(), await derived()], before);
    assert.equal(Number(await budget(6)), attempts + 1);
    await assert.rejects(vote(7, c.id, c.song_a_id), /Comparison unavailable/);
    await sql(
      `update rank_comparisons set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where id='${c.id}'`,
    );
    before = [await sources(), await derived()];
    await assert.rejects(vote(6, c.id, c.song_a_id), /expired/);
    assert.deepEqual([await sources(), await derived()], before);
    assert.notEqual(await start(6), c.id);
    c = await state(6);
    await sql(
      `update songs set status='unavailable' where id='${c.song_a_id}'`,
    );
    try {
      before = [await sources(), await derived()];
      await assert.rejects(vote(6, c.id, c.song_b_id), /Playback unavailable/);
      assert.deepEqual([await sources(), await derived()], before);
      assert.notEqual(await start(6), c.id);
    } finally {
      await sql(`update songs set status='active' where id='${c.song_a_id}'`);
    }
  });
  await test("Rank rate limits, failed attempts and minute rollover are independent of Daily", async () => {
    await resetBudget(7);
    await sql(
      `insert into request_budgets values('${user(7)}','rank',date_trunc('minute',now())-interval '1 minute',10000)`,
    );
    assert.equal(
      await sql(
        asUser(
          7,
          `do $$declare r jsonb;begin
     for i in 1..30 loop r:=submit_rank_vote('00000000-0000-4000-8000-ffffffffffff','respect-aretha');
       if r->>'error' not like 'Comparison unavailable%' then raise exception 'Wrong failed-attempt budget';end if;end loop;
     r:=start_rank_pair();if r->>'error' not like 'Too many Rank%' then raise exception 'Rank budget not enforced';end if;
     perform submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha');
     end $$;reset role;select attempts from request_budgets where user_id=auth.uid() and action='rank' and window_start=date_trunc('minute',now())`,
        ),
      ),
      "31",
    );
    assert.equal(
      await sql(`select total_votes from profiles where user_id='${user(7)}'`),
      "1",
    );
    await resetBudget(7);
    assert(await start(7));
  });
  await test("a four-song pool pauses on cooldown and allows repeat pairs after the bounded window", async () => {
    const pool = [
      "respect-aretha",
      "god-only-knows",
      "dreams-fleetwood-mac",
      "superstition-stevie-wonder",
    ];
    const status = await sql("select jsonb_object_agg(id,status) from songs");
    await sql(
      `update songs set status=case when id in(${pool.map((x) => `'${x}'`).join(",")}) then 'active'::song_status else 'unavailable'::song_status end`,
    );
    try {
      assert.equal(
        await sql(`select count(*) from songs where rank_song_playable(id)`),
        "4",
      );
      await start(8);
      const first = await state(8);
      await vote(8, first.id, first.song_a_id);
      const second = await state(8);
      await vote(8, second.id, second.song_a_id);
      assert.equal(await state(8), null);
      assert.equal(await start(8), null);
      await sql(
        `update rank_comparisons set created_at=now()-interval '12 minutes',voted_at=now()-interval '11 minutes' where id='${first.id}';update rank_votes set created_at=(select voted_at from rank_comparisons where id='${first.id}') where comparison_id='${first.id}'`,
      );
      assert(await start(8));
      const again = await state(8);
      assert.equal(again.song_a_id, first.song_a_id);
      assert.equal(again.song_b_id, first.song_b_id);
      await vote(8, again.id, again.song_a_id);
      assert.equal(
        await sql(`select count(*) from rank_votes where user_id='${user(8)}'`),
        "3",
      );
    } finally {
      await sql(
        `update songs s set status=r.value::text::song_status from jsonb_each_text('${status}'::jsonb) r where id=r.key`,
      );
    }
  });
  await test("eligibility needs four active listening sources; only explicitly authorized available audio substitutes for links", async () => {
    await sql(`begin;update songs set status='unavailable';
    insert into songs(id,title,normalized_title,artist_name,normalized_artist_name,release_year,status) values('rank-audio-only','Audio fixture','audio fixture','Fixture','fixture',2000,'active');
    update songs set status='active' where id in('respect-aretha','god-only-knows','dreams-fleetwood-mac');
    insert into song_audio_sources(song_id,provider,url,availability,licensing_status,authorization_url,attribution,reviewed_by) values('rank-audio-only','Synthetic fixture','https://audio.example.test/synthetic.wav','available','unreviewed',null,'', '${user(1)}');
    do $$begin if rank_song_playable('rank-audio-only') then raise exception 'Unreviewed audio was eligible';end if;end $$;
    update song_audio_sources set licensing_status='authorized',authorization_url='https://audio.example.test/license',attribution='Synthetic test only' where song_id='rank-audio-only';
    do $$begin if not rank_song_playable('rank-audio-only') or (select count(*) from songs where rank_song_playable(id))<>4 then raise exception 'Authorized audio not eligible';end if;end $$;
    update song_audio_sources set availability='unavailable';
    do $$begin if rank_song_playable('rank-audio-only') then raise exception 'Unavailable audio was eligible';end if;end $$;
    rollback`);
  });
  await test("fifty concurrent accounts and a simultaneous Daily/Rank vote preserve every source and deterministic replay order", async () => {
    await sql("update app_settings set elo_k_factor=37 where id=true");
    const ids = await Promise.all(
      Array.from({ length: 50 }, (_, i) => start(i + 10)),
    );
    const choices = await Promise.all(
      Array.from({ length: 50 }, (_, i) => state(i + 10)),
    );
    const began = Date.now();
    const accepted = await Promise.all(
      choices.map((c, i) => vote(i + 10, ids[i], c.song_a_id)),
    );
    assert.equal(accepted.length, 50);
    console.log(
      `RANK BURST accounts=50 accepted=50 errors=0 elapsed_ms=${Date.now() - began}`,
    );
    const id = await sql(
      `insert into rank_comparisons(user_id,song_a_id,song_b_id) values('${user(60)}','god-only-knows','respect-aretha') returning id`,
    );
    await Promise.all([
      vote(60, id, "god-only-knows"),
      sql(
        asUser(
          60,
          "select submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
        ),
      ),
    ]);
    assert.equal(await sql("select sum(elo_rating) from songs"), "30000.00");
    assert.equal(
      await sql("select count(*) from rating_events where event_order is null"),
      "0",
    );
    const expected = await derived(),
      original = await sources();
    await sql("update app_settings set elo_k_factor=3 where id=true");
    await sql(
      "update songs set elo_rating=9999,wins=0,losses=0,matchup_count=0;update daily_matchups set song_a_votes=999,song_b_votes=999;delete from song_rating_snapshots",
    );
    await sql(asUser(1, "select rebuild_rankings()"));
    assert.equal(await derived(), expected);
    assert.equal(await sources(), original);
    await sql(asUser(1, "select rebuild_rankings()"));
    assert.equal(await derived(), expected);
  });
  await test("late vote failures roll back ratings, vote, event, comparison and next pair while retaining request budget", async () => {
    await start(61);
    const c = await state(61);
    const before = [await sources(), await derived()],
      attempts = Number(await budget(61));
    await sql(
      "create function fail_rank_event() returns trigger language plpgsql as $$begin if new.rank_vote_id is not null then raise exception 'Injected late failure';end if;return new;end$$;create trigger fail_rank_event before insert on rating_events for each row execute function fail_rank_event()",
    );
    try {
      await assert.rejects(vote(61, c.id, c.song_a_id), /Could not record/);
      assert.deepEqual([await sources(), await derived()], before);
      assert.equal(Number(await budget(61)), attempts + 1);
    } finally {
      await sql(
        "drop trigger fail_rank_event on rating_events;drop function fail_rank_event()",
      );
    }
  });
  await test("mixed recovery refuses missing Rank events, invalid historical K and causally reordered records atomically", async () => {
    const e = JSON.parse(
      await sql(
        "select to_jsonb(e) from rating_events e where rank_vote_id is not null order by event_order limit 1",
      ),
    );
    const literal = JSON.stringify(e).replaceAll("'", "''");
    const cases = [
      [
        `update rank_comparisons set created_at=voted_at+interval '1 second' where id=(select comparison_id from rank_votes where id='${e.rank_vote_id}')`,
        `update rank_comparisons set created_at=voted_at-interval '1 second' where id=(select comparison_id from rank_votes where id='${e.rank_vote_id}')`,
      ],
      [
        `delete from rating_events where id='${e.id}'`,
        `insert into rating_events select * from jsonb_populate_record(null::rating_events,'${literal}'::jsonb)`,
      ],
      [
        `update rating_events set k_factor=1 where id='${e.id}'`,
        `update rating_events set k_factor=${e.k_factor} where id='${e.id}'`,
      ],
      [
        "update rating_events set event_order=-event_order where rank_vote_id is null",
        "update rating_events set event_order=-event_order where rank_vote_id is null",
      ],
    ];
    for (const [corrupt, restore] of cases) {
      await sql(corrupt);
      try {
        const before = [await sources(), await derived()];
        await assert.rejects(
          sql(asUser(1, "select rebuild_rankings()")),
          /Audit records are inconsistent/,
        );
        assert.deepEqual([await sources(), await derived()], before);
      } finally {
        await sql(restore);
      }
    }
  });
  await test("recovery waits for an accepted Rank vote and Rank waits for recovery without deadlock or data loss", async () => {
    await start(62);
    const c = await state(62);
    const voting = sql(
      asUser(
        62,
        `set local application_name='rank-held-vote';select submit_rank_vote('${c.id}','${c.song_a_id}');select pg_sleep(3)`,
      ),
    );
    await waitFor("application_name='rank-held-vote' and wait_event='PgSleep'");
    const recovering = sql(
      asUser(
        1,
        "set local application_name='rank-waiting-recovery';select rebuild_rankings()",
      ),
    );
    await waitFor(
      "application_name='rank-waiting-recovery' and wait_event_type='Lock'",
    );
    await voting;
    await recovering;
    await start(63);
    const next = await state(63);
    const held = sql(
      asUser(
        1,
        "set local application_name='rank-held-recovery';select rebuild_rankings();select pg_sleep(3)",
      ),
    );
    await waitFor(
      "application_name='rank-held-recovery' and wait_event='PgSleep'",
    );
    const blocked = sql(
      asUser(
        63,
        `set local application_name='rank-waiting-vote';select submit_rank_vote('${next.id}','${next.song_b_id}')`,
      ),
    );
    await waitFor(
      "application_name='rank-waiting-vote' and wait_event_type='Lock'",
    );
    await held;
    await blocked;
    const heldRecovery = sql(
      asUser(
        1,
        "set local application_name='rank-held-issuance-recovery';select rebuild_rankings();select pg_sleep(3)",
      ),
    );
    await waitFor(
      "application_name='rank-held-issuance-recovery' and wait_event='PgSleep'",
    );
    const issuance = sql(
      asUser(
        64,
        "set local application_name='rank-waiting-issuance';select start_rank_pair()",
      ),
    );
    await waitFor(
      "application_name='rank-waiting-issuance' and wait_event_type='Lock'",
    );
    await heldRecovery;
    await issuance;
    const heldIssuance = sql(
      asUser(
        65,
        "set local application_name='rank-held-issuance';select start_rank_pair();select pg_sleep(3)",
      ),
    );
    await waitFor(
      "application_name='rank-held-issuance' and wait_event='PgSleep'",
    );
    const waitingRecovery = sql(
      asUser(
        1,
        "set local application_name='rank-issuance-waiting-recovery';select rebuild_rankings()",
      ),
    );
    await waitFor(
      "application_name='rank-issuance-waiting-recovery' and wait_event_type='Lock'",
    );
    await heldIssuance;
    await waitingRecovery;
    const expected = await derived();
    await sql(asUser(1, "select rebuild_rankings()"));
    assert.equal(await derived(), expected);
  });
  console.log(`${passed} Phase 5A database cases passed.`);
} finally {
  db.close();
}
