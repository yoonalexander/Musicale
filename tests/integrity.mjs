import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  databaseHarness,
  asUser,
  user,
  day,
  createDay,
} from "./database-harness.mjs";

const db = databaseHarness("integrity"),
  { sql } = db;
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
const denied = (query, pattern) => assert.rejects(sql(query), pattern);
const vote = (n, selected = "respect-aretha") =>
  asUser(
    n,
    `select submit_daily_vote((select matchup_id from get_today_matchup()),'${selected}')`,
  );
const state = () =>
  sql(`select jsonb_build_object(
  'songs',(select jsonb_agg(to_jsonb(r) order by id) from songs r),
  'providers',(select jsonb_agg(to_jsonb(r) order by id) from song_providers r),
  'matchups',(select jsonb_agg(to_jsonb(r) order by id) from daily_matchups r),
  'votes',(select jsonb_agg(to_jsonb(r) order by id) from votes r),
  'events',(select jsonb_agg(to_jsonb(r) order by id) from rating_events r),
  'profiles',(select jsonb_agg(to_jsonb(r) order by user_id) from profiles r),
  'activity',(select jsonb_agg(to_jsonb(r) order by vote_id) from user_daily_activity r),
  'snapshots',(select jsonb_agg(to_jsonb(r) order by id) from song_rating_snapshots r),
  'audit',(select jsonb_agg(to_jsonb(r) order by id) from admin_audit_log r))`);

try {
  await db.create();
  await db.migrate();
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await sql(`insert into auth.users(id,email) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'integrity'||n||'@example.test' from generate_series(1,100) n;
    update profiles set role='admin' where user_id='${user(1)}'`);

  await test("direct profile RPC enforces five changes per account/minute", async () => {
    const lines = await sql(
      asUser(
        90,
        Array.from(
          { length: 6 },
          (_, i) =>
            `select json_build_object('result',update_my_display_name('Name ${i + 1}'))`,
        ).join(";"),
      ),
    );
    const results = lines.split("\n").map((line) => JSON.parse(line).result);
    assert.match(results[5]?.error ?? "", /Too many/);
    assert.equal(
      await sql(
        `select display_name from profiles where user_id='${user(90)}'`,
      ),
      "Name 5",
    );
    assert.equal(
      await sql(
        `select attempts from request_budgets where user_id='${user(90)}' and action='profile'`,
      ),
      "6",
    );
    await sql(
      asUser(91, "select update_my_display_name('Independent account')"),
    );
  });

  await test("direct admin RPCs share a thirty-attempt budget", async () => {
    await sql(
      `update profiles set role='admin' where user_id in('${user(92)}','${user(93)}')`,
    );
    const batch = `jsonb_build_array(jsonb_build_object('day',${day}+10,'songA','respect-aretha','songB','god-only-knows'))`;
    const lines = await sql(
      asUser(
        92,
        Array.from(
          { length: 31 },
          () =>
            `select json_build_object('result',schedule_matchup_batch(${batch}))`,
        ).join(";"),
      ),
    );
    const results = lines.split("\n").map((line) => JSON.parse(line).result);
    assert.equal(results[0], 1);
    assert.equal(results[29], 0);
    assert.match(results[30]?.error ?? "", /Too many/);
    await denied(asUser(92, "select save_catalog('[]')"), /Too many/);
    await denied(asUser(92, "select rebuild_rankings()"), /Too many/);
    assert.equal(
      await sql(asUser(93, `select schedule_matchup_batch(${batch})`)),
      "0",
    );
  });

  await test("direct editorial table writes cannot bypass an exhausted admin budget", async () => {
    await denied(
      asUser(92, "update songs set title='Bypassed' where id='respect-aretha'"),
      /Too many/,
    );
    assert.equal(
      await sql("select title from songs where id='respect-aretha'"),
      "Respect",
    );
  });

  await test("recovery refuses inconsistent audit before/after values without partial writes", async () => {
    await sql(vote(2));
    await sql(
      "update rating_events set winner_before=winner_before+1,winner_after=winner_after+1",
    );
    try {
      const before = await sql(
        "select jsonb_agg(to_jsonb(s) order by id) from songs s",
      );
      await denied(
        asUser(1, "select rebuild_rankings()"),
        /Audit records are inconsistent/,
      );
      assert.equal(
        await sql("select jsonb_agg(to_jsonb(s) order by id) from songs s"),
        before,
      );
    } finally {
      await sql(
        "update rating_events set winner_before=winner_before-1,winner_after=winner_after-1",
      );
    }
  });

  await test("late vote failure rolls back every business write but retains its request budget", async () => {
    await sql(`create function fail_late_vote() returns trigger language plpgsql as $$begin
      if auth.uid()='${user(70)}' then raise exception 'forced late test failure';end if;return new;end $$;
      create trigger fail_late_vote after insert or update on song_rating_snapshots for each row execute function fail_late_vote()`);
    try {
      const before = await state();
      await denied(vote(70), /Could not record your vote/);
      assert.equal(await state(), before);
      assert.equal(
        await sql(
          `select sum(attempts) from request_budgets where user_id='${user(70)}' and action='vote'`,
        ),
        "1",
      );
    } finally {
      await sql(
        "drop trigger fail_late_vote on song_rating_snapshots;drop function fail_late_vote()",
      );
    }
  });

  await test("fifty concurrent distinct accounts retain every accepted vote and conserve ratings", async () => {
    const start = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        sql(vote(i + 10, i % 2 ? "god-only-knows" : "respect-aretha")),
      ),
    );
    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason.message);
    assert.deepEqual(errors, []);
    assert.equal(await sql("select count(*) from votes"), "51");
    assert.equal(await sql("select count(*) from rating_events"), "51");
    assert.equal(await sql("select count(*) from user_daily_activity"), "51");
    assert.equal(await sql("select sum(total_votes) from profiles"), "51");
    assert.equal(
      await sql(
        `select song_a_votes+song_b_votes from daily_matchups where matchup_day=${day}`,
      ),
      "51",
    );
    assert.equal(await sql("select sum(elo_rating) from songs"), "30000.00");
    assert.equal(
      await sql(`select count(*) from votes v join rating_events e on e.vote_id=v.id
      where e.winner_after-e.winner_before<>v.rating_delta or e.loser_before-e.loser_after<>v.rating_delta
      or v.rating_delta<>round(e.k_factor*(1-v.expected_score))`),
      "0",
    );
    assert.equal(
      await sql(`select count(*) from profiles p where total_votes<>(select count(*) from votes v where v.user_id=p.user_id)
      or (total_votes>0 and (current_streak<>1 or longest_streak<>1 or last_vote_day<>${day}))`),
      "0",
    );
    assert.equal(
      await sql(`select count(*) from songs s where wins<>(select count(*) from rating_events e where e.winner_song_id=s.id)
      or losses<>(select count(*) from rating_events e where e.loser_song_id=s.id) or matchup_count<>wins+losses`),
      "0",
    );
    assert.equal(
      await sql(`select count(*) from votes v left join rating_events e on e.vote_id=v.id
      left join user_daily_activity a on a.vote_id=v.id where e.id is null or a.vote_id is null or a.user_id<>v.user_id or a.activity_day<>${day}
      or v.selected_rating_before<>e.winner_before or v.selected_rating_after<>e.winner_after
      or v.rejected_rating_before<>e.loser_before or v.rejected_rating_after<>e.loser_after`),
      "0",
    );
    assert.equal(
      await sql(
        `select count(*) from song_rating_snapshots h join songs s on s.id=h.song_id where h.snapshot_date=${day} and h.rating<>s.elo_rating`,
      ),
      "0",
    );
    console.log(
      `BURST accounts=50 accepted=50 errors=0 elapsed_ms=${Math.round(performance.now() - start)}`,
    );
  });

  await test("concurrent opposite choices for one account produce one complete set of changes", async () => {
    const results = await Promise.allSettled([
      sql(vote(60)),
      sql(vote(60, "god-only-knows")),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(
      results.find((r) => r.status === "rejected").reason.message,
      /already voted/,
    );
    assert.equal(
      await sql(`select count(*) from votes where user_id='${user(60)}'`),
      "1",
    );
    assert.equal(
      await sql(
        `select count(*) from user_daily_activity where user_id='${user(60)}'`,
      ),
      "1",
    );
    assert.equal(
      await sql(
        `select current_streak||','||total_votes from profiles where user_id='${user(60)}'`,
      ),
      "1,1",
    );
    assert.equal(await sql("select count(*) from rating_events"), "52");
  });

  await test("anonymous, owner, other account and admin roles enforce table and RPC authorization", async () => {
    for (const table of [
      "profiles",
      "votes",
      "rating_events",
      "user_daily_activity",
      "admin_audit_log",
    ])
      await denied(`set role anon;select * from ${table}`, /permission denied/);
    for (const table of [
      "songs",
      "song_providers",
      "song_rating_snapshots",
      "song_catalog",
    ])
      assert.ok(
        Number(await sql(`set role anon;select count(*) from ${table}`)) > 0,
      );
    for (const [fn, args] of [
      ["process_daily_vote", "null,'respect-aretha'"],
      ["process_display_name", "'Changed'"],
      ["process_catalog", "'[]'"],
      ["process_matchup_batch", "'[]'"],
      ["process_rankings", ""],
    ])
      await denied(asUser(2, `select ${fn}(${args})`), /permission denied/);
    for (const query of [
      "select save_catalog('[]')",
      "select schedule_matchup_batch('[]')",
      "select rebuild_rankings()",
      "select get_admin_overview()",
    ])
      await denied(asUser(3, query), /Admin access/);
    for (const table of ["profiles", "votes", "user_daily_activity"]) {
      assert.equal(
        await sql(
          asUser(2, `select count(*) from ${table} where user_id='${user(2)}'`),
        ),
        "1",
      );
      assert.equal(
        await sql(
          asUser(3, `select count(*) from ${table} where user_id='${user(2)}'`),
        ),
        "0",
      );
      assert.ok(
        Number(await sql(asUser(1, `select count(*) from ${table}`))) > 1,
      );
    }
    for (const query of [
      `update profiles set role='admin' where user_id='${user(2)}'`,
      `update profiles set total_votes=99 where user_id='${user(2)}'`,
      `delete from votes where user_id='${user(2)}'`,
      "insert into rating_events(vote_id) values(null)",
    ])
      await denied(asUser(2, query), /permission denied/);
    assert.equal(
      await sql(asUser(2, "select count(*) from rating_events")),
      "0",
    );
    assert.equal(
      await sql(
        asUser(
          2,
          "update songs set title='Unauthorized';select count(*) from songs where title='Unauthorized'",
        ),
      ),
      "0",
    );
  });

  await test("failed profile RPCs consume budget and an old minute cannot exhaust the new window", async () => {
    const lines = await sql(
      asUser(
        80,
        Array.from(
          { length: 6 },
          () =>
            "select json_build_object('result',update_my_display_name(null))",
        ).join(";"),
      ),
    );
    const results = lines.split("\n").map((s) => JSON.parse(s).result);
    for (const result of results.slice(0, 5))
      assert.match(result.error, /1 to 60/);
    assert.match(results[5].error, /Too many/);
    assert.equal(
      await sql(
        `select display_name from profiles where user_id='${user(80)}'`,
      ),
      "integrity80",
    );
    const output = await sql(`begin;
      insert into request_budgets values('${user(81)}','profile',date_trunc('minute',now())-interval '1 minute',100);
      set local role authenticated;set local request.jwt.claim.sub='${user(81)}';
      select update_my_display_name('New minute');reset role;
      select attempts from request_budgets where user_id='${user(81)}' and window_start=date_trunc('minute',now());commit;`);
    assert.equal(output.trim(), "1");
    await denied(
      "set role anon;select reserve_request('profile')",
      /permission denied/,
    );
    await denied(
      asUser(81, "select reserve_request('unknown')"),
      /Invalid request category/,
    );
  });

  await test("catalog provider failure and invalid scheduling leave complete batches unchanged", async () => {
    const before = await state();
    const song = {
      id: "transaction-song",
      title: "Transactional",
      artistName: "Test artist",
      releaseYear: 2000,
      status: "active",
      providers: [],
    };
    const invalid = {
      ...song,
      id: "invalid-provider",
      providers: [
        {
          provider: "youtube",
          providerSongId: "bad",
          externalUrl: "https://youtube.com.evil.test/watch",
        },
      ],
    };
    await denied(
      asUser(1, `select save_catalog('${JSON.stringify([song, invalid])}')`),
      /official_provider_link/,
    );
    assert.equal(await state(), before);
    const batch = `jsonb_build_array(jsonb_build_object('day',${day}+12,'songA','respect-aretha','songB','god-only-knows'),
      jsonb_build_object('day',${day}+13,'songA','respect-aretha','songB','respect-aretha'))`;
    await denied(
      asUser(1, `select schedule_matchup_batch(${batch})`),
      /playback/,
    );
    assert.equal(await state(), before);
    await denied(asUser(1, "select save_catalog(null)"), /Import 1 to 100/);
    await denied(
      asUser(1, "select schedule_matchup_batch(null)"),
      /Schedule 1 to 31/,
    );
  });

  await test("direct cancellation cannot invalidate an already active voted day", async () => {
    const before = await state();
    await denied(
      asUser(
        1,
        `update daily_matchups set status='cancelled' where matchup_day=${day}`,
      ),
      /Only future unvoted/,
    );
    assert.equal(await state(), before);
  });

  await test("one successful vote and nine duplicate attempts exhaust the ten-attempt window", async () => {
    const lines = await sql(
      asUser(
        82,
        Array.from(
          { length: 11 },
          () =>
            "select json_build_object('result',submit_daily_vote((select matchup_id from get_today_matchup()),'respect-aretha'))",
        ).join(";"),
      ),
    );
    const results = lines.split("\n").map((s) => JSON.parse(s).result);
    assert.ok(results[0].voteId);
    for (const r of results.slice(1, 10))
      assert.match(r.error, /already voted/);
    assert.match(results[10].error, /Too many/);
    assert.equal(
      await sql(
        `select sum(attempts) from request_budgets where user_id='${user(82)}' and action='vote'`,
      ),
      "11",
    );
    assert.equal(
      await sql(`select count(*) from votes where user_id='${user(82)}'`),
      "1",
    );
    assert.equal(
      await sql(
        `select total_votes||','||current_streak from profiles where user_id='${user(82)}'`,
      ),
      "1,1",
    );
  });

  await test("invalid and out-of-window votes preserve every business record", async () => {
    const before = await state();
    await denied(vote(83, "not-a-song"), /not in this matchup/);
    const future = await sql(
      `select id from daily_matchups where matchup_day=${day}+10`,
    );
    await denied(
      asUser(83, `select submit_daily_vote('${future}','respect-aretha')`),
      /not active/,
    );
    await denied(
      asUser(83, "select submit_daily_vote(null,'respect-aretha')"),
      /not active/,
    );
    assert.equal(await state(), before);
    assert.equal(
      await sql(
        `select sum(attempts) from request_budgets where user_id='${user(83)}' and action='vote'`,
      ),
      "3",
    );
  });

  await test("daily result fields are withheld before voting while cumulative catalog statistics stay public", async () => {
    const fields =
      "song_a_votes is null and song_b_votes is null and total_votes is null and selected_song_id is null";
    assert.equal(
      await sql(`set role anon;select ${fields} from get_today_matchup()`),
      "t",
    );
    assert.equal(
      await sql(asUser(3, `select ${fields} from get_today_matchup()`)),
      "t",
    );
    assert.equal(
      await sql(
        asUser(
          2,
          "select total_votes>0 and selected_song_id='respect-aretha' from get_today_matchup()",
        ),
      ),
      "t",
    );
    assert.equal(
      await sql(asUser(2, "select count(*) from daily_matchups")),
      "0",
    );
    assert.ok(
      Number(
        await sql(
          "set role anon;select wins+losses from song_catalog where id='respect-aretha'",
        ),
      ) > 0,
    );
    assert.equal(
      await sql(
        "set role anon;select jsonb_array_length(get_song_matchups('respect-aretha'))",
      ),
      "0",
    );
    await sql(`${createDay(-1)};update daily_matchups set featured=true`);
    assert.equal(
      await sql(
        "set role anon;select jsonb_array_length(get_featured_matchups())",
      ),
      "1",
    );
    assert.equal(
      await sql(
        "set role anon;select jsonb_array_length(get_song_matchups('respect-aretha'))",
      ),
      "1",
    );
    assert.equal(
      JSON.parse(await sql(asUser(3, "select get_my_profile_data()"))).total,
      0,
    );
  });

  console.log(`${passed} Phase 3 integrity tests passed.`);
} finally {
  db.close();
}
