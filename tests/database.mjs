import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  databaseHarness,
  user,
  asUser,
  day,
  createDay,
} from "./database-harness.mjs";
const db = databaseHarness("baseline"),
  { sql } = db;
let assertions = 0;
async function test(name, fn) {
  await fn();
  assertions++;
  console.log(`PASS ${name}`);
}
async function denied(query, pattern) {
  await assert.rejects(sql(query), pattern);
}
const vote = (n, song = "respect-aretha") =>
  asUser(
    n,
    `select submit_daily_vote((select matchup_id from get_today_matchup()),'${song}')`,
  );

try {
  await db.create();
  const files = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await sql(readFileSync(`supabase/migrations/${files[0]}`, "utf8"));
  await sql(`insert into auth.users(id,email) values('${user(1)}','legacy@example.test');
    update profiles set role='admin' where user_id='${user(1)}';
    insert into songs(id,title,musical_title,category,artist_label,release_year) values('old-a','Old A','Old show','broadway','Old artist',2000),('old-b','Old B','Old show','broadway','Old artist',2001);
    insert into votes(user_id,left_song_id,right_song_id,winner_song_id,loser_song_id,rating_delta_winner,rating_delta_loser) values('${user(1)}','old-a','old-b','old-a','old-b',12,-12);`);
  for (const file of files.slice(1))
    await sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await sql(readFileSync("supabase/seed.sql", "utf8"));
  await test("upgrade archives old votes/songs and preserves account roles", async () => {
    assert.equal(await sql("select count(*) from musicale_legacy.votes"), "1");
    assert.equal(await sql("select count(*) from musicale_legacy.songs"), "2");
    assert.equal(
      await sql(`select role from profiles where user_id='${user(1)}'`),
      "admin",
    );
    await denied(
      asUser(1, "select * from musicale_legacy.votes"),
      /permission denied/,
    );
    assert.equal(
      await sql(
        "select to_regprocedure('public.submit_rank_vote(text,text,text)') is null",
      ),
      "t",
    );
  });
  await sql(
    `insert into auth.users(id,email) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test'||n||'@example.test' from generate_series(2,20) n`,
  );
  await test("seed is idempotent and uses a complete UTC day", async () => {
    await sql(readFileSync("supabase/seed.sql", "utf8"));
    assert.equal(await sql("select count(*) from songs"), "20");
    assert.equal(
      await sql(
        "select extract(epoch from ends_at-starts_at) from daily_matchups",
      ),
      "86400.000000",
    );
  });
  await test("unauthenticated users cannot vote or see result counts", async () => {
    await denied(
      "set role anon;select submit_daily_vote(null,'respect-aretha')",
      /permission denied/,
    );
    assert.equal(
      await sql(
        "set role anon;select song_a_votes is null and song_b_votes is null and total_votes is null from get_today_matchup()",
      ),
      "t",
    );
    assert.equal(
      await sql("set role anon;select count(*) from daily_matchups"),
      "0",
    );
  });
  await test("invalid, null and out-of-window choices are rejected", async () => {
    await denied(vote(2, "fast-car-tracy-chapman"), /not in this matchup/);
    await denied(
      asUser(
        2,
        "select submit_daily_vote((select matchup_id from get_today_matchup()),null)",
      ),
      /not in this matchup/,
    );
    await sql(createDay(1));
    const future = await sql(
      `select id from daily_matchups where matchup_day=${day}+1`,
    );
    await denied(
      asUser(2, `select submit_daily_vote('${future}','respect-aretha')`),
      /not active/,
    );
    await denied(
      asUser(
        2,
        "select submit_daily_vote('11111111-1111-4111-8111-111111111111','respect-aretha')",
      ),
      /not active/,
    );
    assert.equal(await sql("select count(*) from votes"), "0");
  });
  await test("a real vote atomically records Elo, results, activity, streak and snapshots", async () => {
    await sql(vote(2));
    assert.equal(
      await sql(
        "select elo_rating||','||wins||','||losses||','||matchup_count from songs where id='respect-aretha'",
      ),
      "1512.00,1,0,1",
    );
    assert.equal(
      await sql("select elo_rating from songs where id='god-only-knows'"),
      "1488.00",
    );
    assert.equal(
      await sql(
        `select current_streak||','||longest_streak||','||total_votes from profiles where user_id='${user(2)}'`,
      ),
      "1,1,1",
    );
    assert.equal(await sql("select count(*) from rating_events"), "1");
    assert.equal(await sql("select count(*) from song_rating_snapshots"), "2");
    assert.equal(
      await sql(asUser(2, "select total_votes from get_today_matchup()")),
      "1",
    );
    assert.equal(
      await sql(
        asUser(3, "select total_votes is null from get_today_matchup()"),
      ),
      "t",
    );
    const history = JSON.parse(
      await sql(asUser(2, "select get_my_vote_history()")),
    );
    assert.equal(history[0].title, "Respect");
    assert.equal(history[0].rating_delta, 12);
  });
  await test("duplicate requests cannot alter a preserved vote", async () => {
    await denied(vote(2, "god-only-knows"), /already voted/);
    assert.equal(await sql("select count(*) from votes"), "1");
    assert.equal(
      await sql(
        "select sum(elo_rating) from songs where id in('respect-aretha','god-only-knows')",
      ),
      "3000.00",
    );
  });
  await test("two concurrent requests for one user record exactly one vote", async () => {
    const results = await Promise.allSettled([
      sql(vote(3)),
      sql(vote(3, "god-only-knows")),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.match(
      results.find((r) => r.status === "rejected").reason.message,
      /already voted/,
    );
    assert.equal(
      await sql(`select count(*) from votes where user_id='${user(3)}'`),
      "1",
    );
  });
  await test("concurrent users retain every vote and conserve Elo totals", async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        sql(vote(i + 4, i % 2 ? "god-only-knows" : "respect-aretha")),
      ),
    );
    assert.equal(await sql("select count(*) from votes"), "8");
    assert.equal(await sql("select count(*) from rating_events"), "8");
    assert.equal(
      await sql("select sum(song_a_votes+song_b_votes) from daily_matchups"),
      "8",
    );
    assert.equal(
      await sql(
        "select sum(elo_rating) from songs where id in('respect-aretha','god-only-knows')",
      ),
      "3000.00",
    );
    assert.equal(await sql("select count(*) from song_rating_snapshots"), "2");
  });
  await test("consecutive day streak increments; missed day resets; UTC is server controlled", async () => {
    await sql(`update profiles set last_vote_day=${day}-1,current_streak=4,longest_streak=7 where user_id='${user(10)}';
      update profiles set last_vote_day=${day}-2,current_streak=4,longest_streak=7 where user_id='${user(11)}'`);
    await sql(vote(10));
    await sql(vote(11));
    assert.equal(
      await sql(
        `select current_streak||','||longest_streak from profiles where user_id='${user(10)}'`,
      ),
      "5,7",
    );
    assert.equal(
      await sql(
        `select current_streak||','||longest_streak from profiles where user_id='${user(11)}'`,
      ),
      "1,7",
    );
    assert.equal(
      await sql(
        `select activity_day=${day} from user_daily_activity where user_id='${user(10)}'`,
      ),
      "t",
    );
  });
  await test("users cannot edit roles, streaks, songs, matchups or other users votes", async () => {
    await denied(
      asUser(
        2,
        `update profiles set role='admin',current_streak=99 where user_id='${user(2)}'`,
      ),
      /permission denied/,
    );
    await denied(asUser(2, createDay(2)), /Admin access required/);
    assert.equal(
      await sql(
        asUser(
          2,
          "update songs set elo_rating=9999 where id='respect-aretha';select elo_rating<9999 from songs where id='respect-aretha'",
        ),
      ),
      "t",
    );
    assert.equal(
      await sql(
        asUser(2, `select count(*) from votes where user_id='${user(3)}'`),
      ),
      "0",
    );
    await denied(
      asUser(2, "select save_catalog('[]')"),
      /Admin access required/,
    );
  });
  await test("admins schedule future matchups, reject duplicate days and audit changes", async () => {
    await sql(asUser(1, createDay(2)));
    await denied(asUser(1, createDay(2)), /duplicate key/);
    await denied(
      asUser(
        1,
        `update daily_matchups set song_a_id='god-only-knows',song_b_id='respect-aretha' where matchup_day=${day}`,
      ),
      /Only future/,
    );
    assert.ok(Number(await sql("select count(*) from admin_audit_log")) >= 1);
  });
  await test("unavailable songs block voting and disappear from the active matchup", async () => {
    await sql(
      asUser(
        1,
        "update songs set status='unavailable' where id='respect-aretha'",
      ),
    );
    assert.equal(await sql("select count(*) from get_today_matchup()"), "0");
    const id = await sql(
      `select id from daily_matchups where matchup_day=${day}`,
    );
    await denied(
      asUser(12, `select submit_daily_vote('${id}','respect-aretha')`),
      /Both songs must be active/,
    );
    await sql(
      asUser(1, "update songs set status='active' where id='respect-aretha'"),
    );
  });
  await test("admin K-factor affects audited future votes", async () => {
    await sql(
      asUser(1, "update app_settings set elo_k_factor=32 where id=true"),
    );
    await sql(vote(12));
    assert.equal(
      await sql(
        "select k_factor from rating_events order by created_at desc limit 1",
      ),
      "32",
    );
  });
  await test("catalog imports update metadata, preserve ratings and roll back partial failures", async () => {
    const input = [
      {
        id: "respect-aretha",
        title: "Respect",
        artistName: "Aretha Franklin",
        albumName: "Single",
        releaseYear: 1967,
        genre: "Soul",
        status: "active",
        providers: [
          {
            provider: "youtube",
            providerSongId: "JzqGZjFnYnA",
            externalUrl: "https://www.youtube.com/watch?v=JzqGZjFnYnA",
          },
        ],
      },
    ];
    const before = await sql(
      "select elo_rating from songs where id='respect-aretha'",
    );
    await sql(asUser(1, `select save_catalog('${JSON.stringify(input)}')`));
    assert.equal(
      await sql("select elo_rating from songs where id='respect-aretha'"),
      before,
    );
    input[0].title = "Should roll back";
    input.push({ ...input[0], id: "another-song" });
    await denied(
      asUser(1, `select save_catalog('${JSON.stringify(input)}')`),
      /duplicate key/,
    );
    assert.equal(
      await sql("select title from songs where id='respect-aretha'"),
      "Respect",
    );
    assert.equal(
      await sql("select count(*) from songs where id='another-song'"),
      "0",
    );
  });
  await test("failed vote attempts persist, throttle per account, and cannot bypass the wrapper", async () => {
    // One transaction fixes now() so a UTC minute rollover cannot split the budget.
    const attempts = await sql(
      asUser(
        19,
        Array.from(
          { length: 24 },
          () =>
            "select json_build_object('result',submit_daily_vote('11111111-1111-4111-8111-111111111111','respect-aretha'))",
        ).join(";"),
      ),
    );
    const results = attempts.split("\n").map((line) => JSON.parse(line).result);
    assert.equal(results.length, 24);
    results.forEach((result, i) =>
      assert.match(result.error, i < 10 ? /not active/ : /Too many/),
    );
    assert.equal(
      await sql(
        `select sum(attempts) from request_budgets where user_id='${user(19)}' and action='vote'`,
      ),
      "24",
    );
    await denied(
      asUser(19, "select process_daily_vote(null,'respect-aretha')"),
      /permission denied/,
    );
    await sql(vote(20));
    await denied(
      asUser(2, "select * from request_budgets"),
      /permission denied/,
    );
    await denied(asUser(2, "select get_admin_overview()"), /Admin access/);
    const overview = JSON.parse(
      await sql(asUser(1, "select get_admin_overview()")),
    );
    assert.equal(overview.suspicious[0].user_id, user(19));
    assert.equal(Number(overview.suspicious[0].attempts), 24);
  });
  await test("profile editing cannot elevate roles and paginated statistics remain private", async () => {
    await sql(asUser(2, "select update_my_display_name('A listener')"));
    assert.equal(
      await sql(
        `select display_name||','||role from profiles where user_id='${user(2)}'`,
      ),
      "A listener,user",
    );
    await sql(asUser(2, "select update_my_display_name(repeat('a',60))"));
    assert.equal(
      await sql(
        `select char_length(display_name) from profiles where user_id='${user(2)}'`,
      ),
      "60",
    );
    for (const [i, name] of [
      "''",
      "null",
      "repeat('a',61)",
      "E'bad\\nname'",
    ].entries())
      await denied(
        asUser(i + 13, `select update_my_display_name(${name})`),
        /1 to 60/,
      );
    assert.equal(
      await sql(`select display_name from profiles where user_id='${user(2)}'`),
      "a".repeat(60),
    );
    const profile = JSON.parse(
      await sql(asUser(2, "select get_my_profile_data(0)")),
    );
    assert.equal(profile.total, 1);
    assert.equal(profile.history.length, 1);
    assert.equal(profile.stats.sample, 0);
    assert.equal(profile.stats.artists.length, 0);
    const next = JSON.parse(
      await sql(asUser(2, "select get_my_profile_data(25)")),
    );
    assert.equal(next.total, 1);
    assert.deepEqual(next.history, []);
    await denied(
      "set role anon;select get_my_profile_data(0)",
      /permission denied/,
    );
  });
  await test("product events store only aggregate counts and reject anonymous or invalid writes", async () => {
    await sql(asUser(2, "select record_product_event('share_copied')"));
    for (const event of [
      "listening_link_clicked",
      "youtube_player_ready",
      "youtube_play_started",
      "youtube_player_error",
      "preview_play_started",
      "preview_play_failed",
    ]) {
      await sql(asUser(2, `select record_product_event('${event}')`));
      assert.equal(
        await sql(
          `select count from product_event_counts where event='${event}'`,
        ),
        "1",
      );
    }
    await sql(asUser(2, "select record_product_event('preview_started')"));
    assert.equal(
      await sql(
        "select count from product_event_counts where event='listening_link_clicked'",
      ),
      "2",
    );
    assert.equal(
      await sql(
        "select count(*) from product_event_counts where event='preview_started'",
      ),
      "0",
    );
    assert.equal(
      await sql(
        "select count from product_event_counts where event='share_copied'",
      ),
      "1",
    );
    assert.equal(
      await sql(asUser(2, "select count(*) from product_event_counts")),
      "0",
    );
    await denied(
      asUser(2, "select record_product_event('email@example.test')"),
      /Invalid event/,
    );
    await denied(
      "set role anon;select record_product_event('daily_view')",
      /permission denied/,
    );
    assert.equal(
      await sql(asUser(1, "select count(*) from product_event_counts")),
      "7",
    );
  });
  await test("catalog saves full metadata and rejects inconsistent dates and invalid duration atomically", async () => {
    const s = {
      id: "metadata-song",
      title: "Metadata",
      artistName: "Artist",
      albumName: "Single",
      releaseYear: 2000,
      releaseDate: "2000-02-29",
      durationMs: 180000,
      artworkUrl: "https://example.test/allowed-art.jpg",
      genre: "Test",
      status: "active",
      providers: [],
    };
    await sql(asUser(1, `select save_catalog('${JSON.stringify([s])}')`));
    assert.equal(
      await sql(
        "select release_date||','||duration_ms from songs where id='metadata-song'",
      ),
      "2000-02-29,180000",
    );
    await denied(
      asUser(
        1,
        `select save_catalog('${JSON.stringify([{ ...s, title: "Changed", releaseDate: "2001-01-01" }])}')`,
      ),
      /consistent_release_date/,
    );
    assert.equal(
      await sql("select title from songs where id='metadata-song'"),
      "Metadata",
    );
    await denied(
      asUser(
        1,
        `select save_catalog('${JSON.stringify([{ ...s, durationMs: 0 }])}')`,
      ),
      /duration/,
    );
  });
  await test("ranking rebuild restores derived records, results and snapshots without changing audit events", async () => {
    const before = await sql(
      "select jsonb_agg(r order by r.id) from(select id,elo_rating,wins,losses,matchup_count from songs) r",
    );
    const votes = await sql("select count(*) from votes"),
      events = await sql("select count(*) from rating_events");
    await sql(
      "update songs set elo_rating=9999 where id='respect-aretha';update daily_matchups set song_a_votes=999 where matchup_day=(now() at time zone 'UTC')::date;delete from song_rating_snapshots;",
    );
    await denied(asUser(2, "select rebuild_rankings()"), /Admin access/);
    assert.equal(await sql(asUser(1, "select rebuild_rankings()")), events);
    assert.equal(
      await sql(
        "select jsonb_agg(r order by r.id) from(select id,elo_rating,wins,losses,matchup_count from songs) r",
      ),
      before,
    );
    assert.equal(await sql("select count(*) from votes"), votes);
    assert.equal(await sql("select count(*) from rating_events"), events);
    assert.equal(
      await sql("select sum(song_a_votes+song_b_votes) from daily_matchups"),
      votes,
    );
    assert.equal(await sql("select count(*) from song_rating_snapshots"), "2");
    assert.equal(
      await sql(
        "select count(*) from admin_audit_log where operation='REBUILD'",
      ),
      "1",
    );
    const delta = await sql(
      `select rating_delta from votes where user_id='${user(2)}'`,
    );
    await sql(
      `update votes set rating_delta=rating_delta+1 where user_id='${user(2)}'`,
    );
    await denied(
      asUser(1, "select rebuild_rankings()"),
      /Audit records are inconsistent/,
    );
    assert.equal(
      await sql(
        "select jsonb_agg(r order by r.id) from(select id,elo_rating,wins,losses,matchup_count from songs) r",
      ),
      before,
    );
    await sql(
      `update votes set rating_delta=${delta} where user_id='${user(2)}'`,
    );
  });
  await test("featured archive reveals only completed matchups", async () => {
    await sql(createDay(-1));
    await sql(asUser(1, "update daily_matchups set featured=true"));
    const archive = JSON.parse(
      await sql("set role anon;select get_featured_matchups()"),
    );
    assert.equal(archive.length, 1);
    assert.equal(archive[0].song_a_title, "Respect");
    const today = await sql(`select ${day}`);
    assert.ok(archive[0].matchup_day < today);
  });
  await test("editorial batch scheduling preserves occupied days and rolls back invalid batches", async () => {
    const today = await sql(`select ${day}`);
    const date = (offset) =>
      new Date(Date.parse(today + "T00:00:00Z") + offset * 86400000)
        .toISOString()
        .slice(0, 10);
    const batch = [
      {
        day: date(5),
        songA: "dreams-fleetwood-mac",
        songB: "superstition-stevie-wonder",
      },
    ];
    await denied(
      asUser(2, `select schedule_matchup_batch('${JSON.stringify(batch)}')`),
      /Admin access/,
    );
    assert.equal(
      await sql(
        asUser(1, `select schedule_matchup_batch('${JSON.stringify(batch)}')`),
      ),
      "1",
    );
    assert.equal(
      await sql(
        asUser(1, `select schedule_matchup_batch('${JSON.stringify(batch)}')`),
      ),
      "0",
    );
    await denied(
      asUser(
        1,
        `select schedule_matchup_batch('${JSON.stringify([
          { ...batch[0], day: date(6) },
          { day: date(7), songA: "bad-guy-billie-eilish", songB: "not-real" },
        ])}')`,
      ),
      /playback/,
    );
    assert.equal(
      await sql(
        `select count(*) from daily_matchups where matchup_day=${day}+6`,
      ),
      "0",
    );
    await denied(
      asUser(
        1,
        "insert into song_providers(song_id,provider,provider_song_id,external_url) values('metadata-song','youtube','bad-link','https://youtube.com.evil.test/watch')",
      ),
      /official_provider_link/,
    );
  });
  await test("completed profile statistics use exact majorities and paginate beyond one page", async () => {
    await sql(`insert into daily_matchups(matchup_day,song_a_id,song_b_id,starts_at,ends_at,song_a_votes,song_b_votes)
      select ${day}-n,'respect-aretha','god-only-knows',(${day}-n)::timestamp at time zone 'UTC',(${day}-n+1)::timestamp at time zone 'UTC',case when n=2 then 501 else 2 end,case when n=2 then 499 else 8 end from generate_series(2,27) n;
      insert into votes(user_id,matchup_id,song_a_id,song_b_id,selected_song_id,rejected_song_id,selected_rating_before,rejected_rating_before,selected_rating_after,rejected_rating_after,expected_score,rating_delta,created_at)
      select '${user(2)}',id,song_a_id,song_b_id,song_a_id,song_b_id,1500,1500,1512,1488,0.5,12,starts_at+interval '1 hour' from daily_matchups where matchup_day between ${day}-27 and ${day}-2;`);
    const first = JSON.parse(
      await sql(asUser(2, "select get_my_profile_data(0)")),
    );
    assert.equal(first.total, 27);
    assert.equal(first.history.length, 25);
    assert.equal(first.stats.sample, 26);
    assert.equal(first.stats.majority, 4); // 501/1000 counts as a majority even though its display rounds to 50%.
    assert.equal(first.stats.artists[0].label, "Aretha Franklin");
    assert.equal(first.stats.artists[0].count, 27);
    assert.equal(first.stats.picks[0].count, 27);
    assert.equal(first.stats.controversial.length, 3);
    assert.equal(first.stats.controversial[0].agreement, 20);
    const second = JSON.parse(
      await sql(asUser(2, "select get_my_profile_data(25)")),
    );
    assert.equal(second.history.length, 2);
    assert.ok(
      !first.history.some((h) => second.history.some((s) => s.id === h.id)),
    );
    const other = JSON.parse(
      await sql(asUser(3, "select get_my_profile_data(0)")),
    );
    assert.equal(other.total, 1);
    assert.equal(other.stats.sample, 0);
  });
  console.log(`${assertions} database integration tests passed.`);
} finally {
  db.close();
}
