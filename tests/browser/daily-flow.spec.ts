import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures";
import { runSql, signIn, requestSignInLink } from "../browser-helpers";
import AxeBuilder from "@axe-core/playwright";
// @ts-expect-error Node-only local test helper.
import { localSettings } from "../local-env.mjs";

test("an email preview cannot consume sign-in before the listener confirms", async ({
  page,
  request,
  context,
}, testInfo) => {
  const email = `preview-${Date.now()}-${testInfo.project.name}@example.test`;
  // Check both the signup-confirmation and returning-user magic-link templates.
  for (const returning of [false, true]) {
    const link = await requestSignInLink(page, request, email);
    expect(new URL(link).pathname).toBe("/api/auth/callback");
    expect(new URL(link).searchParams.has("token_hash")).toBe(true);
    const callback = await request.get(link, { maxRedirects: 0 });
    expect(callback.status()).toBe(307);
    expect(callback.headers()["referrer-policy"]).toBe("no-referrer");
    // A separate email/preview client opens the link before the listener's browser.
    const preview = await request.get(link);
    expect(preview.url()).toContain("/auth/confirm?");
    expect(preview.headers()["cache-control"]).toContain("no-store");
    expect(
      runSql(
        `select count(*) from auth.sessions where user_id=(select id from auth.users where email='${email}')`,
      ),
    ).toBe("0");
    await context.clearCookies(); // The destination browser has no PKCE verifier.
    await page.goto(link);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      "content",
      "no-referrer",
    );
    await expect(
      page.getByRole("button", { name: "Vote for Respect" }),
    ).toHaveCount(0);
    const confirm = page.getByRole("button", { name: "Confirm sign-in" });
    await expect(confirm).toBeEnabled();
    await page.screenshot({
      path: `output/${testInfo.project.name}-confirm-sign-in.png`,
      fullPage: true,
    });
    await confirm.click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(
      runSql(
        `select count(*) from auth.sessions where user_id=(select id from auth.users where email='${email}')`,
      ),
    ).toBe("1");
    await expect(page).not.toHaveURL(/token_hash/);
    if (!returning) {
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL("/");
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
    }
  }
});

test("previously sent PKCE email links still work in their requesting browser", async ({
  page,
  request,
}, testInfo) => {
  const email = `legacy-${Date.now()}-${testInfo.project.name}@example.test`;
  const link = new URL(await requestSignInLink(page, request, email));
  const legacy = new URL("/auth/v1/verify", localSettings().API_URL);
  legacy.searchParams.set("token", link.searchParams.get("token_hash")!);
  legacy.searchParams.set("type", "signup");
  link.search = "";
  legacy.searchParams.set("redirect_to", link.toString());
  await page.goto(legacy.toString());
  await expect(page).toHaveURL("/");
});

test("sign-in prevents repeated submission and invalid links offer recovery", async ({
  page,
}) => {
  await page.goto("/login");
  let release!: () => void;
  let posts = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/login", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      await gate;
    }
    await route.continue();
  });
  try {
    await page
      .getByLabel("Email address")
      .fill(`pending-${Date.now()}@example.test`);
    await page.getByRole("button", { name: "Send magic link" }).click();
    const pending = page.getByRole("button", { name: "Sending link…" });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await page.getByLabel("Email address").press("Enter");
    expect(posts).toBe(1);
  } finally {
    release();
  }
  await expect(
    page.getByText("Magic link sent. Check your inbox."),
  ).toBeVisible();
  for (const path of [
    "/api/auth/callback",
    "/api/auth/callback?code=invalid-test-code",
  ]) {
    await page.goto(path);
    await expect(
      page.getByText(/Sign-in link expired, was already used/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toBeEnabled();
  }
  await page.goto("/auth/confirm?token_hash=invalid-test-token");
  await page.getByRole("button", { name: "Confirm sign-in" }).click();
  await expect(
    page.getByText(/Sign-in link expired or was already used/),
  ).toBeVisible();
  for (const path of [
    "/auth/confirm",
    "/auth/confirm?token_hash=bad%20token",
    "/auth/confirm?token_hash=one&token_hash=two",
  ]) {
    await page.goto(path);
    await expect(
      page.getByText("This sign-in link is unavailable."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm sign-in" }),
    ).toHaveCount(0);
  }
});

for (const [mode, timezoneId] of [
  ["timer", "Pacific/Honolulu"],
  ["visibility", "Asia/Tokyo"],
] as const) {
  test.describe(`UTC rollover via ${mode}`, () => {
    test.use({ timezoneId });
    test("expires stale voting and refreshes the server's availability", async ({
      page,
      request,
    }, testInfo) => {
      const email = `rollover-${mode}-${Date.now()}-${testInfo.project.name}@example.test`;
      await signIn(page, request, email);
      const fixture = JSON.parse(
        runSql(
          "select json_build_object('id',matchup_id,'endsAt',ends_at,'songId',song_a->>'id') from get_today_matchup()",
        ),
      );
      const status = runSql(
        `select status from songs where id='${fixture.songId}'`,
      );
      await page.clock.install({ time: new Date() });
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Vote for Respect" }),
      ).toBeEnabled();
      let release!: () => void;
      let refreshes = 0;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/today?*", async (route) => {
        if (route.request().headers()["rsc"] === "1") {
          refreshes++;
          await gate;
        }
        await route.continue();
      });
      try {
        // Only the local test fixture is unavailable; the browser simulates crossing UTC midnight.
        runSql(
          `update songs set status='unavailable' where id='${fixture.songId}'`,
        );
        const end = new Date(fixture.endsAt).getTime();
        if (mode === "timer") {
          await page.clock.fastForward(end - Date.now() + 1000);
        } else {
          // A suspended tab misses timers; only its clock and visibility event advance.
          await page.clock.setSystemTime(new Date(end + 1000));
          await page.evaluate(() =>
            document.dispatchEvent(new Event("visibilitychange")),
          );
        }
        await expect.poll(() => refreshes).toBe(1);
        await expect(page.getByText(/This matchup has ended/)).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Vote for Respect" }),
        ).toBeDisabled();
        await expect(
          page.getByRole("button", { name: "Vote for God Only Knows" }),
        ).toBeDisabled();
        release();
        await expect(
          page.getByRole("heading", { name: "No matchup is available today." }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Browse the catalog" }),
        ).toHaveAttribute("href", "/leaderboard");
        await expect(
          page.getByRole("link", { name: "View past matchups" }),
        ).toHaveAttribute("href", "/archive");
        expect(
          runSql(
            `select count(*) from votes where user_id=(select id from auth.users where email='${email}')`,
          ),
        ).toBe("0");
      } finally {
        release();
        runSql(
          `update songs set status='${status}' where id='${fixture.songId}'`,
        );
      }
    });
  });
}

test("public pages stay usable at narrow widths and missing songs return 404", async ({
  page,
  request,
}, testInfo) => {
  for (const path of [
    "/",
    "/today",
    "/leaderboard",
    "/login",
    "/songs/respect-aretha",
    "/privacy",
    "/help",
    "/archive",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  await page.goto("/today");
  await page.screenshot({
    path: `output/${testInfo.project.name}-today.png`,
    fullPage: true,
  });
  const missing = await request.get("/songs/not-a-song");
  expect(missing.status()).toBe(404);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect(
    (
      await request.post("/api/analytics", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { event: "daily_view" },
      })
    ).status(),
  ).toBe(401);
});

test("public pages pass automated accessibility checks at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of [
    "/",
    "/today",
    "/leaderboard",
    "/login",
    "/songs/respect-aretha",
    "/privacy",
    "/archive",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(report.violations, path).toEqual([]);
  }
});

test.beforeAll(() => {
  runSql(readFileSync("supabase/seed.sql", "utf8"));
});
