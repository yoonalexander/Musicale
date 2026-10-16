import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  migrations,
  user,
  asUser,
} from "./database-harness.mjs";
const db = databaseHarness("play"),
  { sql } = db;
let passed = 0;
const test = async (name, run) => {
  await run();
  passed++;
  console.log(`PASS ${name}`);
};
const rpc = async (n, expression) =>
  JSON.parse((await sql(asUser(n, `select ${expression}`))) || "null");
const start = (n, restart) =>
  rpc(n, `start_play(${restart ? `'${restart}'` : ""})`);
const state = (n, answer) =>
  rpc(n, `get_play_state(${answer ? `'${answer}'` : ""})`);
const guess = (n, r, choice) =>
  rpc(n, `submit_play_guess('${r.id}','${choice}')`);
const round = async (n) =>
  JSON.parse(
    await sql(
      `select row_to_json(c) from play_rounds c join play_runs r on r.id=c.run_id where r.user_id='${user(n)}' order by r.created_at desc,c.number desc limit 1`,
    ),
  );
const higher = (r) =>
  Number(r.rating_a) > Number(r.rating_b) ? r.song_a_id : r.song_b_id;
const lower = (r) => (higher(r) === r.song_a_id ? r.song_b_id : r.song_a_id);
const core = () =>
  sql(
    `select jsonb_build_object('songs',(select jsonb_agg(to_jsonb(s) order by id) from songs s),'providers',(select jsonb_agg(to_jsonb(s) order by id) from song_providers s),'daily',(select jsonb_agg(to_jsonb(s) order by id) from daily_matchups s),'votes',(select jsonb_agg(to_jsonb(s) order by id) from votes s),'rank',(select jsonb_agg(to_jsonb(s) order by id) from rank_votes s),'comparisons',(select jsonb_agg(to_jsonb(s) order by id) from rank_comparisons s),'events',(select jsonb_agg(to_jsonb(s) order by event_order) from rating_events s),'profiles',(select jsonb_agg(to_jsonb(s) order by user_id) from profiles s),'activity',(select jsonb_agg(to_jsonb(s) order by vote_id) from user_daily_activity s),'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from song_rating_snapshots s))`,
  );
const requestCount = (n) =>
  sql(
    `select coalesce(sum(attempts),0) from request_budgets where user_id='${user(n)}' and action='play'`,
  );
const resetBudget = (n) =>
  sql(
    `delete from request_budgets where user_id='${user(n)}' and action='play'`,
  );
const expire = (r) =>
  sql(
    `update play_rounds set created_at=now()-interval '40 minutes',expires_at=now()-interval '1 minute' where id='${r.id}'`,
  );
let songs;
async function evidence(n, a, b) {
  const id = await sql(
    `update rank_comparisons set status='expired' where user_id='${user(n)}' and status='pending';insert into rank_comparisons(user_id,song_a_id,song_b_id) values('${user(n)}',least('${a}','${b}'),greatest('${a}','${b}')) returning id`,
  );
  await rpc(n, `submit_rank_vote('${id}','${a}')`);
}
try {
  await db.create();
  const files = migrations(),
    index = files.findIndex((f) => f.startsWith("0013_"));
  await db.migrate(files.slice(0, index));
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(
    `insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'play'||n||'@example.test' from generate_series(1,70) n;update profiles set role='admin' where user_id='${user(1)}'`,
  );
  songs = (await sql("select id from songs order by id limit 6")).split("\n");
  await rpc(
    2,
    "submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
  );
  for (let i = 0; i < 6; i += 2) await evidence(3, songs[i], songs[i + 1]);
  await test("Play migration preserves the 20-song populated catalog, preferences, rankings, audit and participation", async () => {
    const before = await core();
    await db.migrate(files.slice(index));
    assert.equal(await core(), before);
    assert.equal(await sql("select count(*) from songs"), "20");
  });
  const untouched = await core();
  await test("private issuance is stable under concurrent starts; GET cannot issue, reroll or reveal answers", async () => {
    assert.equal(await state(4), null);
    assert.equal(await requestCount(4), "0");
    const starts = await Promise.all(Array.from({ length: 5 }, () => start(4)));
    assert.equal(new Set(starts.map((x) => x.runId)).size, 1);
    const s = await state(4),
      r = await round(4),
      count = await requestCount(4);
    assert.deepEqual(Object.keys(s.round).sort(), [
      "expiresAt",
      "id",
      "number",
      "songAId",
      "songBId",
    ]);
    assert.equal(s.answer, null);
    assert.equal(s.round.id, r.id);
    assert.deepEqual(await state(4), s);
    assert.equal(await requestCount(4), count);
    await assert.rejects(start(4, s.run.id), /Finish the current round/);
    for (const n of [1, 4, 5])
      for (const table of ["play_runs", "play_rounds"])
        await assert.rejects(
          sql(asUser(n, `select * from ${table}`)),
          /permission denied/,
        );
    for (const fn of [
      "start_play()",
      "get_play_state()",
      `submit_play_guess('${r.id}','${higher(r)}')`,
    ])
      await assert.rejects(
        sql(`set role anon;select ${fn}`),
        /permission denied/,
      );
    for (const fn of [
      `prepare_play_round('${s.run.id}')`,
      `play_song_eligible('${r.song_a_id}')`,
    ])
      await assert.rejects(sql(asUser(4, `select ${fn}`)), /permission denied/);
    assert.equal(
      await sql(
        "select string_agg(tablename,',' order by tablename) from pg_publication_tables where pubname='supabase_realtime'",
      ),
      "songs",
    );
    await assert.rejects(guess(5, r, higher(r)), /Round unavailable/);
    await assert.rejects(start(5, s.run.id), /Run unavailable/);
    await assert.rejects(guess(4, r, "not-a-song"), /Choose a song/);
    await assert.rejects(
      sql(asUser(4, `update play_runs set score=999 where id='${s.run.id}'`)),
      /permission denied/,
    );
  });
  await test("correct guesses score once, expose only graded snapshots and replace exactly one randomly chosen slot", async () => {
    const seeds = [-1, -0.5, 0, 0.5, 1];
    let slots = new Set();
    for (let i = 0; i < seeds.length; i++) {
      const n = 10 + i;
      await start(n);
      const old = await round(n);
      const expected = await sql(
        `select setseed(${seeds[i]});select case when random()<0.5 then 1 else 2 end`,
      );
      const result = JSON.parse(
        await sql(
          asUser(
            n,
            `select setseed(${seeds[i]});select submit_play_guess('${old.id}','${higher(old)}')`,
          ),
        ),
      );
      assert.equal(result.correct, true);
      assert.equal(result.scoreAfter, 1);
      const saved = await state(n, old.id),
        next = await round(n),
        slot = saved.answer.replacementSlot;
      slots.add(slot);
      assert.equal(slot, Number(expected.trim()));
      assert.equal(saved.answer.ratingA, Number(old.rating_a));
      assert.equal(saved.answer.ratingB, Number(old.rating_b));
      assert.equal(saved.answer.scoreAfter, 1);
      assert.equal(saved.run.score, 1);
      assert.equal(next.number, 2);
      assert.equal(
        next[slot === 1 ? "song_b_id" : "song_a_id"],
        old[slot === 1 ? "song_b_id" : "song_a_id"],
      );
      assert.ok(
        ![old.song_a_id, old.song_b_id].includes(
          next[slot === 1 ? "song_a_id" : "song_b_id"],
        ),
      );
      assert.notEqual(Number(next.rating_a), Number(next.rating_b));
      assert.equal((await guess(n, old, higher(old))).replayed, true);
      assert.equal((await round(n)).id, next.id);
      await assert.rejects(
        guess(n, old, lower(old)),
        /already has a saved answer/,
      );
      assert.equal(await state(5, old.id), null);
      if (i === 0) {
        await start(6);
        assert.equal((await state(6, old.id)).answer, null);
      }
    }
    assert.deepEqual([...slots].sort(), [1, 2]);
  });
  await test("same-choice and opposite-choice races have one score/answer/advance; wrong ends a run", async () => {
    for (const [n, opposite] of [
      [20, false],
      [21, true],
    ]) {
      await start(n);
      const r = await round(n);
      const results = await Promise.allSettled([
        guess(n, r, higher(r)),
        guess(n, r, opposite ? lower(r) : higher(r)),
      ]);
      const s = await state(n),
        count = await sql(
          `select count(*) from play_rounds where run_id='${s.run.id}'`,
        );
      assert.equal(s.run.score, s.answer.correct ? 1 : 0);
      assert.equal(count, s.answer.correct ? "2" : "1");
      assert.equal(
        results.filter((x) => x.status === "rejected").length,
        opposite ? 1 : 0,
      );
    }
    await start(22);
    const old = await round(22);
    await guess(22, old, higher(old));
    const next = await round(22);
    await guess(22, next, lower(next));
    const ended = await state(22);
    assert.equal(ended.run.score, 1);
    assert.equal(ended.run.status, "ended");
    assert.equal(ended.round, null);
    const reset = await Promise.all([
      start(22, ended.run.id),
      start(22, ended.run.id),
    ]);
    assert.equal(new Set(reset.map((x) => x.runId)).size, 1);
    assert.notEqual(reset[0].runId, ended.run.id);
    const newState = await state(22);
    assert.equal(newState.run.score, 0);
    await start(22, ended.run.id);
    assert.deepEqual(await state(22), newState);
  });
  await test("expiry preserves score and resumes the same songs with fresh snapshots; reads stay pure", async () => {
    await start(23);
    let r = await round(23);
    await guess(23, r, higher(r));
    r = await round(23);
    await expire(r);
    const before = await requestCount(23),
      s = await state(23);
    assert.equal(s.run.status, "paused");
    assert.equal(s.run.reason, "expired");
    assert.equal(s.run.score, 1);
    assert.equal(s.round, null);
    assert.equal((await round(23)).status, "pending");
    assert.equal(await requestCount(23), before);
    await assert.rejects(guess(23, r, higher(r)), /expired/);
    assert.equal((await state(23)).run.score, 1);
    await start(23);
    const fresh = await round(23);
    assert.notEqual(fresh.id, r.id);
    assert.equal(fresh.song_a_id, r.song_a_id);
    assert.equal(fresh.song_b_id, r.song_b_id);
    assert.equal(fresh.number, r.number + 1);
    assert.equal((await state(23)).run.score, 1);
  });
  await test("unavailable songs pause instead of losing points; resume or explicit restart is safe", async () => {
    await start(24);
    const r = await round(24);
    const original = await sql(
      `select status from songs where id='${r.song_a_id}'`,
    );
    await sql(
      `update songs set status='unavailable' where id='${r.song_a_id}'`,
    );
    try {
      assert.equal((await state(24)).run.reason, "unavailable");
      await assert.rejects(guess(24, r, higher(r)), /Listening unavailable/);
      await start(24);
      assert.equal((await state(24)).run.status, "paused");
      assert.equal((await state(24)).run.score, 0);
    } finally {
      await sql(
        `update songs set status='${original}' where id='${r.song_a_id}'`,
      );
    }
    await start(24);
    const fresh = await round(24);
    assert.equal(fresh.song_a_id, r.song_a_id);
    assert.equal(fresh.song_b_id, r.song_b_id);
    await expire(fresh);
    const old = (await state(24)).run.id;
    await start(24, old);
    assert.notEqual((await state(24)).run.id, old);
  });
  await test("initial ties and unplayed songs are excluded; no replacement preserves earned points and recorded slot", async () => {
    const available = await sql(
      "select string_agg(id,',') from songs where status='active'",
    );
    await sql("update songs set status='unavailable' where status='active'");
    try {
      await start(25);
      assert.equal((await state(25)).run.status, "paused");
      assert.equal((await state(25)).run.score, 0);
      // A forged counter cannot substitute for an accepted preference.
      const unplayed = await sql(
        "select id from songs where not exists(select 1 from votes where selected_song_id=songs.id or rejected_song_id=songs.id) and not exists(select 1 from rank_votes where selected_song_id=songs.id or rejected_song_id=songs.id) limit 1",
      );
      const original = await sql(
        `select matchup_count from songs where id='${unplayed}'`,
      );
      await sql(
        `update songs set status='active',matchup_count=999,wins=999 where id='${unplayed}'`,
      );
      await start(25);
      assert.equal((await state(25)).round, null);
      await sql(
        `update songs set status='unavailable',matchup_count=${original},wins=0 where id='${unplayed}'`,
      );
      await sql(
        `update songs set status='active' where id in('${songs[0]}','${songs[2]}')`,
      );
      await start(25);
      assert.equal((await state(25)).round, null); // equal winners
      await sql(
        `update songs set status='unavailable' where id='${songs[2]}';update songs set status='active' where id='${songs[1]}'`,
      );
      await start(25);
      const r = await round(25);
      await guess(25, r, higher(r));
      const s = await state(25);
      assert.equal(s.run.status, "paused");
      assert.equal(s.run.score, 1);
      assert.equal(s.round, null);
      await start(25);
      assert.equal((await state(25)).round, null);
      const kept = s.answer.replacementSlot === 1 ? r.song_b_id : r.song_a_id;
      const candidate = kept === songs[0] ? songs[3] : songs[2];
      await sql(`update songs set status='active' where id='${candidate}'`);
      await start(25);
      const next = await round(25);
      assert.equal(
        next[s.answer.replacementSlot === 1 ? "song_b_id" : "song_a_id"],
        kept,
      );
      assert.equal(
        next[s.answer.replacementSlot === 1 ? "song_a_id" : "song_b_id"],
        candidate,
      );
    } finally {
      await sql(
        `update songs set status='active' where id=any(string_to_array('${available}',','))`,
      );
    }
  });
  await test("a late next-round failure rolls back answer, score and advancement while charging the attempt", async () => {
    await start(26);
    const r = await round(26),
      s = await state(26),
      before = Number(await requestCount(26));
    await sql(
      `create function fail_play() returns trigger language plpgsql as $$begin raise exception 'test late failure';end$$;create trigger fail_play before insert on play_rounds for each row execute function fail_play()`,
    );
    try {
      await assert.rejects(guess(26, r, higher(r)), /Could not confirm/);
      assert.deepEqual(await state(26), s);
      assert.equal((await round(26)).status, "pending");
      assert.equal(Number(await requestCount(26)), before + 1);
    } finally {
      await sql(
        "drop trigger fail_play on play_rounds;drop function fail_play()",
      );
    }
    await guess(26, r, higher(r));
    assert.equal((await state(26)).run.score, 1);
  });
  await test("Play budget includes failed guesses, is bounded at thirty, and is separate from Rank/Daily", async () => {
    assert.equal(await core(), untouched);
    await start(27);
    const r = await round(27);
    await resetBudget(27);
    await sql(
      asUser(
        27,
        `do $$declare result jsonb;begin
      for i in 1..30 loop result:=submit_play_guess('${r.id}','absent');
      if result->>'error'<>'Choose a song from this round.' then raise exception 'Failed guess budget mismatch';end if;end loop;
      result:=submit_play_guess('${r.id}','${higher(r)}');
      if result->>'error'<>'Too many Play requests. Try again next minute.' then raise exception 'Budget was not enforced';end if;
      end$$`,
      ),
    );
    assert.equal((await state(27)).run.score, 0);
    assert.equal(await requestCount(27), "31");
    await rpc(27, "start_rank_pair()");
    await rpc(
      27,
      "submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha')",
    );
    await sql(
      `update request_budgets set window_start=now()-interval '2 minutes' where user_id='${user(27)}' and action='play'`,
    );
    await guess(27, r, higher(r));
    assert.equal((await state(27)).run.score, 1);
  });
  // The deliberate Daily/Rank requests above are excluded from Play's isolation comparison.
  await test("all Play operations leave ranking/audit/Daily state untouched", async () => {
    // User 27's legitimate Daily/Rank mutation is tested separately; replay produces its deterministic derived state.
    await sql(asUser(1, "select rebuild_rankings()"));
    const before = await core();
    await Promise.all([start(28), start(29), start(30)]);
    for (const n of [28, 29, 30]) {
      const r = await round(n);
      await guess(n, r, higher(r));
      const next = await round(n);
      await guess(n, next, lower(next));
    }
    assert.equal(await core(), before);
  });
  await test("concurrent preference votes can flip live order without changing the issued answer; next retained rating refreshes", async () => {
    await start(31);
    const r = await round(31),
      chosen = higher(r),
      opponent = lower(r);
    // Legitimate preference RPCs change the live order after issuance.
    for (let i = 32; i < 38; i++) await evidence(i, opponent, chosen);
    assert.equal(
      await sql(
        `select (select elo_rating from songs where id='${opponent}')>(select elo_rating from songs where id='${chosen}')`,
      ),
      "t",
    );
    const before = await core();
    await guess(31, r, chosen);
    const s = await state(31, r.id),
      next = await round(31);
    assert.equal(s.answer.correct, true);
    assert.equal(s.run.score, 1);
    assert.equal(s.answer.ratingA, Number(r.rating_a));
    assert.equal(
      Number(next.rating_a),
      Number(
        await sql(`select elo_rating from songs where id='${next.song_a_id}'`),
      ),
    );
    assert.equal(
      Number(next.rating_b),
      Number(
        await sql(`select elo_rating from songs where id='${next.song_b_id}'`),
      ),
    );
    assert.equal(await core(), before);
  });
  await test("Play and ranking recovery share song-first locks without deadlock", async () => {
    await start(38);
    const r = await round(38);
    const holding = sql(
      `begin;lock table songs in exclusive mode;select pg_sleep(1);commit`,
    );
    // Wait for the lock to be held, rather than relying on a timer.
    for (let i = 0; i < 50; i++)
      if (
        (await sql(
          "select exists(select 1 from pg_locks where relation='songs'::regclass and mode='ExclusiveLock' and granted)",
        )) === "t"
      )
        break;
    const submission = guess(38, r, higher(r));
    await Promise.all([holding, submission]);
    assert.equal((await state(38)).run.score, 1);
    await sql(asUser(1, "select rebuild_rankings()"));
    assert.equal((await state(38)).run.score, 1);
  });
  await test("a guess accepted before expiry survives slow writes and simultaneous Daily/Rank updates", async () => {
    await start(40);
    const r = await round(40),
      chosen = higher(r),
      other = lower(r);
    await sql(`create function slow_play() returns trigger language plpgsql as $$begin perform pg_sleep(10);return new;end$$;
      create trigger slow_play before update on play_rounds for each row when(new.status='answered') execute function slow_play();
      update play_rounds set expires_at=clock_timestamp()+interval '8 seconds' where id='${r.id}'`);
    try {
      const submission = sql(
        asUser(
          40,
          `set local application_name='play-held';select submit_play_guess('${r.id}','${chosen}')`,
        ),
      );
      let held = false;
      for (let i = 0; i < 50; i++)
        if (
          (await sql(
            "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='play-held' and wait_event='PgSleep')",
          )) === "t"
        ) {
          held = true;
          break;
        }
      assert.ok(
        held,
        "Play write reached the controlled synchronization point",
      );
      await Promise.all([
        evidence(41, other, chosen),
        rpc(
          42,
          "submit_daily_vote((select matchup_id from get_today_matchup()),'god-only-knows')",
        ),
      ]);
      assert.equal(JSON.parse(await submission).correct, true);
      const s = await state(40, r.id);
      assert.equal(s.run.score, 1);
      assert.equal(s.answer.ratingA, Number(r.rating_a));
      assert.equal(s.answer.ratingB, Number(r.rating_b));
      assert.equal(
        await sql(
          `select answered_at<expires_at and clock_timestamp()>expires_at from play_rounds where id='${r.id}'`,
        ),
        "t",
      );
      assert.equal(
        await sql(
          `select total_votes||','||current_streak from profiles where user_id='${user(40)}'`,
        ),
        "0,0",
      );
      assert.equal(
        await sql(
          `select count(*) from rank_votes where user_id='${user(40)}'`,
        ),
        "0",
      );
    } finally {
      await sql(
        "drop trigger slow_play on play_rounds;drop function slow_play()",
      );
    }
  });
  console.log(`${passed} Play database checks passed`);
} finally {
  db.close();
}
