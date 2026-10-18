import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  runSql,
  signIn,
  dismissPlayTutorial,
  seedRankEvidence,
} from "../browser-helpers";
// @ts-expect-error Local-only test helper.
import { localSettings } from "../local-env.mjs";
const local = localSettings();
const latestGuest = () =>
  runSql(
    "select id from auth.users where is_anonymous order by created_at desc limit 1",
  );
const latestRound = (uid: string) =>
  JSON.parse(
    runSql(
      `select row_to_json(c) from play_rounds c join play_runs r on r.id=c.run_id where r.user_id='${uid}' order by r.created_at desc,c.number desc limit 1`,
    ),
  );

// Guest/auth checks use the honest outage fallback; player lifecycle has its own suite.
test.beforeEach(async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
});

test("guest welcome: first-visit tutorial, compact cards, keyboard, scoring, persistence and private account history", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const before = runSql("select count(*) from auth.users where is_anonymous");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Musicale" })).toBeVisible();
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeEnabled();
  const bounds = await play.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height);
  expect(runSql("select count(*) from auth.users where is_anonymous")).toBe(
    before,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-guest-welcome.png`,
    fullPage: true,
  });
  await play.click();
  await expect(page).toHaveURL(/\/play$/);
  const uid = latestGuest();
  expect(uid).toBeTruthy();
  seedRankEvidence(uid);
  if (
    runSql(
      `select count(*) from play_rounds c join play_runs r on r.id=c.run_id where r.user_id='${uid}' and c.status='pending'`,
    ) !== "1"
  )
    await page.getByRole("button", { name: "Resume run", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "How to play" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Let’s play", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole("button", { name: "Close how to play", exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-guest-tutorial.png`,
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close how to play" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Let’s play", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close how to play" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "How to play", exact: true }),
  ).toBeFocused();
  const form = page.locator("form.matchup"),
    r = latestRound(uid),
    chosen =
      Number(r.rating_a) > Number(r.rating_b) ? r.song_a_id : r.song_b_id;
  const cards = form.locator("article"),
    a = await cards.nth(0).boundingBox(),
    b = await cards.nth(1).boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  await expect(
    page
      .locator(".site-header")
      .getByRole("link", { name: "Profile", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".site-header")
      .getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await form.locator(`button[value="${chosen}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Run score")).toContainText("1");
  await expect(
    page.getByRole("heading", { name: "Correct!", exact: true }),
  ).toBeFocused();
  const next = latestRound(uid);
  await page.reload();
  await expect(form.locator('input[name="roundId"]')).toHaveValue(next.id);
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close how to play" }).click();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(
    info.project.use.viewport ?? { width: 1280, height: 720 },
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-guest-play.png`,
    fullPage: true,
  });
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?/);
  expect(
    runSql(
      `select total_votes||','||current_streak from profiles where user_id='${uid}'`,
    ),
  ).toBe("0,0");
});

test("guests rank and vote Daily, then a verified new email preserves their activity and unlocks history", async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  await page.goto("/rank");
  await page.getByRole("button", { name: "Get a pair", exact: true }).click();
  const buttons = page.locator('form.matchup button[name="selectedSongId"]');
  await expect(buttons).toHaveCount(2);
  const uid = latestGuest();
  await buttons.first().click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your preference is saved." }),
  ).toContainText("Your preference is saved.");
  expect(runSql(`select count(*) from rank_votes where user_id='${uid}'`)).toBe(
    "1",
  );
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Vote for Respect", exact: true })
    .click();
  await expect(page.locator(".result")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Vote for Respect", exact: true }),
  ).toBeDisabled();
  expect(
    runSql(
      `select total_votes||','||current_streak from profiles where user_id='${uid}'`,
    ),
  ).toBe("1,1");
  const email = `guest-upgrade-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  expect(
    runSql(
      `select id||','||is_anonymous from auth.users where email='${email}'`,
    ),
  ).toBe(`${uid},false`);
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(
    page.getByText("1 continuous preferences.", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator("section.panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Recent Daily votes",
          exact: true,
        }),
      })
      .locator(".vote-history"),
  ).toContainText("Respect");
});

test("guest signup failure is honest and retryable; guest metadata never grants admin or exposes another run", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const unverified = await request.get(
    "/api/auth/guest-confirm?code=untrusted",
  );
  expect(new URL(unverified.url()).pathname).toBe("/login");
  await page.goto("/");
  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "unexpected_failure",
        msg: "Test unavailable",
      }),
    }),
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Could not start guest play",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/auth/v1/signup");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await dismissPlayTutorial(page);
  const owner = latestGuest(),
    r = latestRound(owner);
  const response = await request.post(`${local.API_URL}/auth/v1/signup`, {
    headers: { apikey: local.ANON_KEY },
    data: { data: { role: "admin" } },
  });
  expect(response.ok()).toBe(true);
  const stranger = await response.json();
  expect(stranger.user.is_anonymous).toBe(true);
  expect(
    runSql(`select role from profiles where user_id='${stranger.user.id}'`),
  ).toBe("user");
  const headers = {
    apikey: local.ANON_KEY,
    Authorization: `Bearer ${stranger.access_token}`,
  };
  const raw = await request.get(
    `${local.API_URL}/rest/v1/play_rounds?select=*`,
    { headers },
  );
  expect(raw.ok()).toBe(false);
  const grade = await request.post(
    `${local.API_URL}/rest/v1/rpc/submit_play_guess`,
    { headers, data: { p_round_id: r.id, p_selected_song_id: r.song_a_id } },
  );
  expect((await grade.json()).error).toBe("Round unavailable.");
  const admin = await request.post(
    `${local.API_URL}/rest/v1/rpc/get_admin_overview`,
    { headers, data: {} },
  );
  expect(admin.ok()).toBe(false);
  expect(runSql(`select score from play_runs where id='${r.run_id}'`)).toBe(
    "0",
  );
  const identities = runSql("select count(*) from auth.users");
  await page.goto("/");
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "unexpected_failure",
        msg: "Test unavailable",
      }),
    }),
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Could not check your session",
  );
  expect(runSql("select count(*) from auth.users")).toBe(identities);
  await page.unroute("**/auth/v1/user");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator('input[name="roundId"]')).toHaveValue(r.id);
});

test("signing into an existing account preserves its history without silently merging guest votes", async ({
  page,
  request,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(150000);
  const email = `guest-existing-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  const existing = runSql(`select id from auth.users where email='${email}'`);
  const other = await browser.newContext({ baseURL });
  try {
    const guest = await other.newPage();
    await guest.goto("/rank");
    await guest
      .getByRole("button", { name: "Get a pair", exact: true })
      .click();
    const choices = guest.locator('form.matchup button[name="selectedSongId"]');
    await expect(choices).toHaveCount(2);
    const uid = latestGuest();
    await choices.first().click();
    await expect(guest.getByRole("status")).toContainText(
      "Your preference is saved.",
    );
    await signIn(guest, request, email);
    await guest.goto("/profile");
    await expect(
      guest.getByText("0 continuous preferences.", { exact: false }),
    ).toBeVisible();
    expect(
      runSql(`select count(*) from rank_votes where user_id='${uid}'`),
    ).toBe("1");
    expect(
      runSql(`select count(*) from rank_votes where user_id='${existing}'`),
    ).toBe("0");
  } finally {
    await other.close();
  }
});

test("Daily is available without an account and preserves one vote for the guest session", async ({
  page,
}) => {
  await page.goto("/today");
  const vote = page.getByRole("button", {
    name: "Vote for Respect",
    exact: true,
  });
  await expect(vote).toBeEnabled();
  await vote.click();
  await expect(page.locator(".result")).toBeVisible();
  const uid = latestGuest();
  expect(runSql(`select count(*) from votes where user_id='${uid}'`)).toBe("1");
  await page.reload();
  await expect(vote).toBeDisabled();
  await expect(
    page
      .locator(".site-header")
      .getByRole("link", { name: "Profile", exact: true }),
  ).toHaveCount(0);
});
