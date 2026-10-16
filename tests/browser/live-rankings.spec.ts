import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runSql, signIn } from "../browser-helpers";
// @ts-expect-error Node-only local helper refuses hosted URLs.
import { localSettings } from "../local-env.mjs";
const settings = localSettings();
const row = (page: Page, id = "respect-aretha") =>
  page.locator('.leader-row[href="/songs/' + id + '"]');
async function ready(page: Page) {
  await expect(page.getByRole("status")).toContainText(
    "Live rankings connected",
    { timeout: 15000 },
  );
}
async function actor(role = "user") {
  const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = "live-" + crypto.randomUUID() + "@example.test",
    password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  if (role === "admin")
    runSql(
      "update profiles set role='admin' where user_id='" +
        created.data.user!.id +
        "'",
    );
  const db = createClient(settings.API_URL, settings.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await db.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return db;
}
async function voteRpc() {
  const db = await actor();
  const today = await db.rpc("get_today_matchup");
  const result = await db.rpc("submit_daily_vote", {
    p_matchup_id: today.data[0].matchup_id,
    p_selected_song_id: "respect-aretha",
  });
  expect(result.error).toBeNull();
  expect(result.data.error).toBeUndefined();
}

test("two browsers: app vote and direct RPC bypass warm cache through public push", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const watcher = await browser.newContext({
    viewport: page.viewportSize(),
    recordVideo: { dir: "output/live-demo" },
  });
  const other = await watcher.newPage();
  const frames: string[] = [];
  other.on("websocket", (socket) =>
    socket.on("framereceived", (frame) => frames.push(String(frame.payload))),
  );
  let refreshes = 0;
  other.on("request", (r) => {
    if (r.url().includes("/api/leaderboard?")) refreshes++;
  });
  try {
    await other.goto("/leaderboard");
    await ready(other);
    await signIn(
      page,
      request,
      "live-app-" + crypto.randomUUID() + "@example.test",
    );
    const before = runSql(
      "select matchup_count from songs where id='respect-aretha'",
    );
    const initialRefreshes = refreshes;
    const started = Date.now();
    await page
      .getByRole("button", { name: "Vote for Respect", exact: true })
      .click();
    await expect(
      page.getByText("Vote recorded", { exact: true }),
    ).toBeVisible();
    await expect(row(other)).toContainText(Number(before) + 1 + " votes", {
      timeout: 5000,
    });
    const appLatency = Date.now() - started;
    expect(appLatency).toBeLessThan(5000);
    expect(refreshes - initialRefreshes).toBeLessThanOrEqual(2);
    const cachedContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const cachedPage = await cachedContext.newPage();
    await cachedPage.goto("/leaderboard");
    await expect(row(cachedPage)).toContainText(Number(before) + 1 + " votes");
    const rpcStarted = Date.now();
    await voteRpc();
    await expect(row(other)).toContainText(Number(before) + 2 + " votes", {
      timeout: 5000,
    });
    const rpcLatency = Date.now() - rpcStarted;
    expect(rpcLatency).toBeLessThan(5000);
    await cachedPage.reload();
    await expect(row(cachedPage)).toContainText(Number(before) + 1 + " votes");
    await cachedContext.close();
    expect(
      frames.some(
        (frame) =>
          frame.includes('"postgres_changes"') && frame.includes('"songs"'),
      ),
    ).toBe(true);
    const changes = frames.filter(
      (frame) =>
        frame.includes('"postgres_changes"') && frame.includes('"record"'),
    );
    expect(changes.length).toBeGreaterThanOrEqual(4);
    for (const frame of changes) {
      expect(frame).not.toMatch(
        /user_id|email|selected_song_id|matchup_id|request_budgets|profiles|audit_log/,
      );
    }
    const response = await request.get("/api/leaderboard?artist=Aretha");
    expect(response.headers()["cache-control"]).toBe("no-store");
    const payload = await response.json();
    expect(Object.keys(payload).sort()).toEqual(["songs", "total"]);
    expect(Object.keys(payload.songs[0]).sort()).toEqual(
      [
        "id",
        "title",
        "artistName",
        "albumName",
        "artworkUrl",
        "releaseYear",
        "releaseDate",
        "durationMs",
        "recentMovement",
        "genre",
        "eloRating",
        "wins",
        "losses",
        "matchupCount",
        "status",
        "providers",
      ].sort(),
    );
    expect(JSON.stringify(payload)).not.toMatch(
      /user_id|email|selected_song_id|vote_id|matchup_id/,
    );
    console.log(
      "LIVE LATENCY " +
        testInfo.project.name +
        ": app=" +
        appLatency +
        "ms RPC=" +
        rpcLatency +
        "ms",
    );
    await other.screenshot({
      path: "output/" + testInfo.project.name + "-live-rankings.png",
      fullPage: true,
    });
  } finally {
    await watcher.close();
  }
});

test("live catalog imports, availability and rebuild retain filters, sort and page", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = await actor("admin");
  const prefix = "live-" + crypto.randomUUID().slice(0, 8);
  const songs = Array.from({ length: 30 }, (_, i) => ({
    id: prefix + "-" + String(i).padStart(2, "0"),
    title: "Live catalog " + i,
    artistName: prefix,
    albumName: "Single",
    releaseYear: 2000,
    genre: "Test",
    status: "active",
    providers: [],
  }));
  try {
    await page.goto(
      "/leaderboard?artist=" +
        prefix +
        "&sort=votes&page=2&minimum=0&genre=Test&year=2000&decade=2000",
    );
    await ready(page);
    const imported = await db.rpc("save_catalog", { p_songs: songs });
    expect(imported.error).toBeNull();
    expect(imported.data?.error).toBeUndefined();
    await expect(page.locator(".leader-row")).toHaveCount(5, { timeout: 5000 });
    await expect(page.locator(".pagination")).toContainText(
      "Page 2 · 30 songs",
    );
    await expect(page.locator(".leader-row").first()).toHaveAttribute(
      "href",
      "/songs/" + songs[25].id,
    );
    await expect(page.getByLabel("Sort by")).toHaveValue("votes");
    const edit = await db.rpc("save_catalog", {
      p_songs: [{ ...songs[25], title: "Live edited title" }],
    });
    expect(edit.error).toBeNull();
    expect(edit.data?.error).toBeUndefined();
    await expect(page.locator(".leader-row").first()).toContainText(
      "Live edited title",
    );
    const disabled = await db
      .from("songs")
      .update({ status: "unavailable" })
      .eq("id", songs[25].id);
    expect(disabled.error).toBeNull();
    await expect(page.locator(".leader-row")).toHaveCount(4);
    await expect(page.locator(".pagination")).toContainText(
      "Page 2 · 29 songs",
    );
    expect(
      (
        await db
          .from("songs")
          .update({ status: "unavailable" })
          .in(
            "id",
            songs.slice(26).map((s) => s.id),
          )
      ).error,
    ).toBeNull();
    await expect(page.locator(".leader-row")).toHaveCount(0);
    await expect(page.locator(".pagination")).toContainText(
      "Page 2 · 25 songs",
    );
    await expect(
      page.getByRole("link", { name: "Previous", exact: true }),
    ).toBeVisible();
    await page.goto("/leaderboard?artist=Aretha&sort=movement");
    await ready(page);
    const baseline = Number(
      runSql("select elo_rating from songs where id='respect-aretha'"),
    );
    runSql("update songs set elo_rating=9999 where id='respect-aretha'");
    await expect(row(page)).toContainText("9999");
    const rebuild = await db.rpc("rebuild_rankings");
    expect(rebuild.error).toBeNull();
    expect(rebuild.data?.error).toBeUndefined();
    await expect(row(page)).toContainText(String(Math.round(baseline)));
    await expect(row(page)).toContainText("this week");
  } finally {
    // Only disposable, never-voted catalog fixtures in the guarded local backend.
    runSql("delete from songs where id like '" + prefix + "%'");
  }
});

test("offline recovery, visible-tab refresh, failed reads and subscription cleanup", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.goto("/leaderboard?artist=Aretha");
  await ready(page);
  const initial = Number(
    runSql("select matchup_count from songs where id='respect-aretha'"),
  );
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("disconnected");
  await voteRpc();
  await context.setOffline(false);
  await expect(row(page)).toContainText(initial + 1 + " votes", {
    timeout: 15000,
  });
  await ready(page);
  await page.route("**/api/leaderboard?**", (route) =>
    route.fulfill({ status: 503, body: '{"error":"Unavailable"}' }),
  );
  await page
    .getByRole("button", { name: "Refresh rankings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Could not refresh");
  await expect(row(page)).toContainText(initial + 1 + " votes");
  await page.unroute("**/api/leaderboard?**");
  await page
    .getByRole("button", { name: "Refresh rankings", exact: true })
    .click();
  await ready(page);
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    }),
  );
  await voteRpc();
  await expect(row(page)).toContainText(initial + 1 + " votes");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(row(page)).toContainText(initial + 2 + " votes");
  // Read the actual database subscription rows, rather than counting JavaScript callbacks.
  for (let n = 0; n < 3; n++) {
    await page
      .getByRole("link", { name: "Today", exact: true })
      .first()
      .click();
    await expect
      .poll(
        () =>
          Number(
            runSql(
              "select count(*) from realtime.subscription where entity='public.songs'::regclass",
            ),
          ),
        { timeout: 15000 },
      )
      .toBe(0);
    await page
      .getByRole("link", { name: "Leaderboard", exact: true })
      .first()
      .click();
    await ready(page);
    await expect
      .poll(
        () =>
          Number(
            runSql(
              "select count(*) from realtime.subscription where entity='public.songs'::regclass",
            ),
          ),
        { timeout: 15000 },
      )
      .toBe(1);
  }
});

test.beforeAll(() => {
  runSql(readFileSync("supabase/seed.sql", "utf8"));
});
