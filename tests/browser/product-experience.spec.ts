import { test, expect as baseExpect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runSql, signIn } from "../browser-helpers";
import { readFileSync } from "node:fs";
// @ts-expect-error Node-only local test helper.
import { localSettings } from "../local-env.mjs";
const expect = baseExpect.configure({ timeout: 15000 });
test.beforeAll(() => runSql(readFileSync("supabase/seed.sql", "utf8")));
async function checkPage(page: Page, width: number, path: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("onboarding, honest initial ratings, support, metadata and missing pages", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "One daily listening habit." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Sign in with an email link and vote once/),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  for (const [path, title] of [
    ["/today", "Today’s matchup"],
    ["/leaderboard", "Live leaderboard"],
    ["/login", "Sign in"],
    ["/privacy", "Privacy and analytics"],
    ["/help", "Help and contact"],
    ["/archive", "Featured matchups"],
    ["/songs/respect-aretha", "Respect · Aretha Franklin"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(title + " — Musicale");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{20}/,
    );
  }
  await page.goto("/help");
  await expect(
    page.getByRole("link", { name: /Open a Musicale support issue/ }),
  ).toHaveAttribute(
    "href",
    "https://github.com/yoonalexander/musicale/issues/new",
  );
  // Rank may vote on any playable starter song; this metadata-only fixture stays unrated.
  const initialId = "initial-ui-" + crypto.randomUUID();
  runSql(`insert into songs(id,title,normalized_title,artist_name,normalized_artist_name,album_name,release_year,status)
    values('${initialId}','Initial fixture','initial fixture','${initialId}','${initialId}','Single',2000,'active')`);
  try {
    await page.goto(`/songs/${initialId}`);
    await expect(
      page.getByText("Not ranked yet", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(/Starting rating:/)).toBeVisible();
    await page.goto(`/leaderboard?artist=${initialId}`);
    await expect(page.locator(".leader-row")).toContainText("Initial rating");
  } finally {
    runSql(`delete from songs where id='${initialId}'`);
  }
  await page.goto("/archive");
  await expect(page.getByText(/No featured matchups yet/)).toBeVisible();
  const missing = await page.goto("/songs/does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("link", { name: "Browse the catalog", exact: true }),
  ).toBeVisible();
  await checkPage(page, 320, "/help");
  await page.screenshot({
    path: "output/" + info.project.name + "-phase5-help.png",
    fullPage: true,
  });
});

test("both vote controls lock while pending, then preserve saved choice and focused results", async ({
  page,
  request,
}) => {
  await signIn(
    page,
    request,
    "phase5-vote-" + crypto.randomUUID() + "@example.test",
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/today", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Vote for God Only Knows", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Recording…", exact: true }),
    ).toHaveCount(2);
    for (const button of await page
      .getByRole("button", { name: "Recording…", exact: true })
      .all())
      await expect(button).toBeDisabled();
    release();
    await expect(
      page.getByText("Vote recorded", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /chose the same song/ }),
    ).toBeFocused();
    await expect(page.locator(".result-counts")).toContainText("Respect");
    await expect(page.locator(".result-counts")).toContainText(
      "God Only Knows",
    );
    await expect(page.getByText(/Voting resets at 00:00 UTC/)).toBeVisible();
    await page.reload();
    await expect(page.locator(".song-choice.chosen")).toContainText(
      "God Only Knows",
    );
  } finally {
    release();
    await page.unroute("**/today");
  }
});

test("larger ranking catalog covers every sort and filter with visible mobile statistics", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const prefix = "p5-" + crypto.randomUUID().slice(0, 8);
  runSql(
    "insert into songs(id,title,normalized_title,artist_name,normalized_artist_name,album_name,release_year,genre,elo_rating,wins,losses,matchup_count) select '" +
      prefix +
      "-'||lpad(n::text,2,'0'),'Fixture '||n,'fixture '||n,'" +
      prefix +
      "','" +
      prefix +
      "','Fixture album',case when n%2=0 then 2000 else 1999 end,case when n%2=0 then 'Even' else 'Odd' end,1500+n,n,40,40+n from generate_series(1,60) n",
  );
  try {
    for (const sort of ["rating", "wins", "votes", "movement"]) {
      await page.goto("/leaderboard?artist=" + prefix + "&sort=" + sort);
      await expect(page.locator(".leader-row")).toHaveCount(25);
      await expect(page.locator(".leader-row").first()).toHaveAttribute(
        "href",
        "/songs/" + prefix + "-60",
      );
      await expect(page.getByLabel("Sort by")).toHaveValue(sort);
    }
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.locator(".pagination")).toContainText(
      "Page 2 · 60 songs",
    );
    await expect(page.locator(".leader-row").first()).toHaveAttribute(
      "href",
      "/songs/" + prefix + "-35",
    );
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.locator(".leader-row")).toHaveCount(10);
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(page.locator(".pagination")).toContainText("Page 2");
    await page.goto(
      "/leaderboard?artist=" +
        prefix +
        "&genre=Even&year=2000&decade=2000&minimum=90&sort=votes",
    );
    await expect(page.locator(".leader-row")).toHaveCount(6);
    await expect(page.getByLabel("Minimum votes")).toHaveValue("90");
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(
      page.locator(".leader-row").first().locator(":scope > span"),
    ).toBeVisible();
    await expect(page.locator(".leader-row").first()).toContainText(
      "100 votes",
    );
    await expect(page.locator(".leader-row").first()).toContainText("60% wins");
    await page.goto("/leaderboard?artist=" + prefix + "&sort=movement");
    await expect(
      page
        .locator(".leader-row")
        .first()
        .getByText("+60 this week", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "output/" + info.project.name + "-phase5-mobile-ranking.png",
      fullPage: true,
    });
    await page.goto("/leaderboard?artist=" + prefix + "&genre=Missing");
    await expect(page.getByText("No songs match these filters.")).toBeVisible();
  } finally {
    runSql("delete from songs where id like '" + prefix + "%'");
  }
});

test("profile empty state, sample thresholds, pagination, streaks and archived song data", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120000);
  const email = "phase5-history-" + crypto.randomUUID() + "@example.test";
  await signIn(page, request, email);
  const id = runSql("select id from auth.users where email='" + email + "'");
  await page.goto("/profile");
  await expect(
    page.getByText("Vote in your first daily matchup to begin your history."),
  ).toBeVisible();
  const fixture = (from: number, to: number) =>
    runSql(
      "do $$ declare m uuid;v uuid;d date;begin for n in " +
        from +
        ".." +
        to +
        " loop d:=(now() at time zone 'UTC')::date-n;insert into daily_matchups(matchup_day,song_a_id,song_b_id,starts_at,ends_at,created_by,status,featured,song_a_votes,song_b_votes) values(d,'respect-aretha','god-only-knows',d::timestamp at time zone 'UTC',(d+1)::timestamp at time zone 'UTC','" +
        id +
        "','complete',true,3,2) returning daily_matchups.id into m;insert into votes(user_id,matchup_id,song_a_id,song_b_id,selected_song_id,rejected_song_id,selected_rating_before,rejected_rating_before,selected_rating_after,rejected_rating_after,expected_score,rating_delta,created_at) values('" +
        id +
        "',m,'respect-aretha','god-only-knows','respect-aretha','god-only-knows',1500,1500,1512,1488,0.5,12,d::timestamp at time zone 'UTC'+interval '12 hours') returning votes.id into v;insert into user_daily_activity(user_id,activity_day,vote_id) values('" +
        id +
        "',d,v);end loop;end $$;update profiles set total_votes=" +
        to +
        ",current_streak=" +
        to +
        ",longest_streak=" +
        to +
        ",last_vote_day=(now() at time zone 'UTC')::date-1 where user_id='" +
        id +
        "'",
    );
  try {
    fixture(1, 4);
    await page.reload();
    await expect(
      page.getByText("Listening patterns appear after at least five votes."),
    ).toBeVisible();
    fixture(5, 5);
    await page.reload();
    await expect(
      page.getByText(/You chose the majority in 100% of 5/),
    ).toBeVisible();
    fixture(6, 26);
    await page.reload();
    await expect(page.locator(".vote-history li")).toHaveCount(25);
    await expect(
      page.getByText(/You chose the majority in 100% of 26/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Most selected artists" }),
    ).toBeVisible();
    await expect(page.locator(".stats").first()).toContainText("26");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.locator(".vote-history li")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Daily history pages" }),
    ).toContainText("Page 2 · 26 Daily votes");
    await page.goto("/archive");
    await expect(page.locator("article.panel").first()).toContainText(
      "3–2 · 5 listeners",
    );
    await expect(
      page
        .locator("article.panel")
        .first()
        .getByRole("link", { name: "Respect", exact: true }),
    ).toBeVisible();
    await page.goto("/songs/respect-aretha");
    await expect(
      page.getByRole("heading", { name: "Recent daily matchups" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Respect \(3\) vs God Only Knows \(2\)/).first(),
    ).toBeVisible();
    for (const width of [320, 390, 1280])
      await checkPage(page, width, "/profile");
    await page.screenshot({
      path: "output/" + info.project.name + "-phase5-profile.png",
      fullPage: true,
    });
  } finally {
    runSql(
      "delete from daily_matchups where created_by='" +
        id +
        "';update profiles set total_votes=0,current_streak=0,longest_streak=0,last_vote_day=null where user_id='" +
        id +
        "'",
    );
  }
});

test("editor can paste CSV, upload JSON, replace a future day, change availability and review audit", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120000);
  const email = "phase5-editor-" + crypto.randomUUID() + "@example.test";
  const { createClient } = await import("@supabase/supabase-js");
  const backend = localSettings();
  const service = createClient(backend.API_URL, backend.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const owner = created.data.user!.id;
  runSql("update profiles set role='admin' where user_id='" + owner + "'");
  await signIn(page, request, email);
  const prefix = "p5-edit-" + crypto.randomUUID().slice(0, 8);
  try {
    await page.goto("/admin");
    await page.getByText("Open bulk import", { exact: true }).click();
    await page.getByLabel("Import format").selectOption("csv");
    await page
      .getByLabel("Catalog JSON or CSV")
      .fill(
        "id,title,artistName,albumName,releaseYear,status,providers\n" +
          prefix +
          ",Paste import,Test artist,Single,2000,disabled,[]",
      );
    await page
      .getByRole("button", { name: "Save catalog", exact: true })
      .click();
    await expect(
      page.getByText("1 songs saved.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Save catalog",
        exact: true,
        includeHidden: true,
      }),
    ).toHaveAttribute("aria-busy", "false");
    await page.getByText("Open bulk import", { exact: true }).click();
    await page.getByLabel("Import format").selectOption("json");
    await page.getByLabel("Catalog file (optional)").setInputFiles({
      name: "songs.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([
          {
            id: prefix + "-json",
            title: "JSON file import " + prefix,
            artistName: "Test artist",
            albumName: "Single",
            releaseYear: 2001,
            status: "disabled",
            providers: [],
          },
        ]),
      ),
    });
    await page
      .getByRole("button", { name: "Save catalog", exact: true })
      .click();
    await expect(
      page.getByText("1 songs saved.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Save catalog",
        exact: true,
        includeHidden: true,
      }),
    ).toHaveAttribute("aria-busy", "false");
    await expect(
      page.getByLabel("Status for JSON file import " + prefix),
    ).toHaveCount(1);
    await page.getByText("Manage song availability", { exact: true }).click();
    const status = page.getByLabel("Status for JSON file import " + prefix);
    await status.selectOption("unavailable");
    await status
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      page.getByText("Song status saved.", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 45);
    const day = date.toISOString().slice(0, 10);
    const existing = runSql(
      "select id from daily_matchups where matchup_day='" + day + "'",
    );
    if (existing)
      await page.locator('select[name="replaceId"]').selectOption(existing);
    await page.getByLabel("Musicale day (UTC)").fill(day);
    await page
      .getByRole("combobox", { name: "Song A", exact: true })
      .selectOption("respect-aretha");
    await page
      .getByRole("combobox", { name: "Song B", exact: true })
      .selectOption("dreams-fleetwood-mac");
    await page
      .getByRole("button", { name: "Save matchup", exact: true })
      .click();
    await expect(
      page.getByText("Matchup saved.", { exact: true }),
    ).toBeVisible();
    const matchup = runSql(
      "select id from daily_matchups where matchup_day='" + day + "'",
    );
    await page.locator('select[name="replaceId"]').selectOption(matchup);
    await page.getByLabel("Musicale day (UTC)").fill(day);
    await page
      .getByRole("combobox", { name: "Song B", exact: true })
      .selectOption("god-only-knows");
    await page
      .getByRole("button", { name: "Save matchup", exact: true })
      .click();
    await expect(
      page.getByText("Matchup saved.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        runSql(
          "select song_b_id from daily_matchups where id='" + matchup + "'",
        ),
      )
      .toBe("god-only-knows");
    await expect(
      page.getByRole("button", { name: "Save matchup", exact: true }),
    ).toHaveAttribute("aria-busy", "false");
    await page.getByText("Show recent changes", { exact: true }).click();
    await expect(
      page.getByText("UPDATE daily_matchups", { exact: false }).first(),
    ).toBeVisible();
    for (const width of [320, 390, 1280])
      await checkPage(page, width, "/admin");
    await page.screenshot({
      path: "output/" + info.project.name + "-phase5-admin.png",
      fullPage: true,
    });
  } finally {
    runSql(
      "delete from daily_matchups where created_by='" +
        owner +
        "' and starts_at>now();delete from songs where id in ('" +
        prefix +
        "','" +
        prefix +
        "-json')",
    );
  }
});

test("database read failure offers safe recovery without exposing internals", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  try {
    runSql("alter view song_catalog rename to phase5_catalog_fault");
    await page.goto("/leaderboard?artist=fault-" + crypto.randomUUID());
    await expect(
      page.getByRole("heading", { name: "We couldn’t tune in." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Musicale support", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "phase5_catalog_fault",
    );
  } finally {
    runSql(
      "alter view phase5_catalog_fault rename to song_catalog;notify pgrst,'reload schema'",
    );
  }
  const backend = localSettings();
  await expect
    .poll(async () =>
      (
        await request.get(
          backend.API_URL + "/rest/v1/song_catalog?select=id&limit=1",
          { headers: { apikey: backend.ANON_KEY } },
        )
      ).status(),
    )
    .toBe(200);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The leaderboard", exact: true }),
  ).toBeVisible();
});
