import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
// @ts-expect-error Node-only local test helper.
import { localSettings } from "../local-env.mjs";

localSettings(); // Refuse tests against a hosted project.
const runSql = (text: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_musicale",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: text, encoding: "utf8" },
  ).trim();

test("daily vote: magic link, keyboard vote, result, sharing and persistence", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const email = `musicale-${Date.now()}-${testInfo.project.name}@example.test`;
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Which song stays with you?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vote for Respect" }),
  ).toBeDisabled();
  await expect(page.locator(".result")).toHaveCount(0);
  const provider = page
    .getByRole("link", { name: "Listen on YouTube" })
    .first();
  await expect(provider).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=JzqGZjFnYnA",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(
    page.getByText("Magic link sent. Check your inbox."),
  ).toBeVisible();
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await request.get(
        "http://127.0.0.1:55324/api/v1/messages",
      );
      const inbox = await response.json();
      const message = inbox.messages.find(
        (m: { To: { Address: string }[]; ID: string }) =>
          m.To.some((t) => t.Address === email),
      );
      messageId = message?.ID ?? "";
      return Boolean(messageId);
    })
    .toBe(true);
  const message = await (
    await request.get(`http://127.0.0.1:55324/api/v1/message/${messageId}`)
  ).json();
  const href = String(message.HTML).match(
    /href="([^"]*\/auth\/v1\/verify[^"]*)"/,
  )?.[1];
  expect(href, "Local sign-in email contains a verification link").toBeTruthy();
  await page.goto(href!.replaceAll("&amp;", "&"));
  await expect(page).toHaveURL(/\/today$/);
  const vote = page.getByRole("button", { name: "Vote for Respect" });
  await expect(vote).toBeEnabled();
  await vote.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Vote recorded", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Your current streak:", { exact: false }),
  ).toContainText("1 day");
  await expect(
    page.getByRole("button", { name: "Vote for Respect" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Vote for God Only Knows" }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${testInfo.project.name}-result.png`,
    fullPage: true,
  });
  // Force the clipboard failure path so fallback remains usable on mobile/insecure browsers.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Unavailable")) },
    }),
  );
  await page.getByRole("button", { name: "Copy spoiler-free result" }).click();
  const share = page.getByLabel("Share result");
  await expect(share).toBeVisible();
  const text = await share.inputValue();
  expect(text).toContain("Musicale #");
  expect(text).toContain("1-day streak");
  expect(text).not.toContain("Respect");
  expect(text).not.toContain("God Only Knows");
  await page.reload();
  await expect(page.getByText("Vote recorded", { exact: true })).toBeVisible();
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Recent votes" }),
  ).toBeVisible();
  await expect(page.locator(".vote-history")).toContainText("Respect");
  await page.getByText("Edit display name", { exact: true }).click();
  await expect(
    page.getByLabel("Display name", { exact: true }),
  ).toHaveAttribute("maxlength", "60");
  await page.getByLabel("Display name", { exact: true }).fill("a".repeat(60));
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect(
    page.getByRole("heading", { name: "a".repeat(60), exact: true }),
  ).toBeVisible();
  await page.getByText("Edit display name", { exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Test listener");
  await page.getByRole("button", { name: "Save display name" }).click();
  await expect(
    page.getByRole("heading", { name: "Test listener", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Display name saved.")).toBeVisible();
  await page.goto("/songs/respect-aretha");
  await expect(
    page.getByRole("img", { name: /Elo rating history/ }),
  ).toBeVisible();
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "The leaderboard" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/${testInfo.project.name}-leaderboard.png`,
    fullPage: true,
  });
  await page.getByLabel("Genre", { exact: true }).fill("Soul");
  await page.getByLabel("Artist", { exact: true }).fill("Aretha");
  await page.getByLabel("Release year", { exact: true }).fill("1967");
  await page
    .getByRole("combobox", { name: "Decade", exact: true })
    .selectOption("1960");
  await page.getByLabel("Sort by").selectOption("movement");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".leader-row")).toHaveCount(1);
  await expect(page.locator(".leader-row")).toContainText("Respect");
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/leaderboard");
  await expect(page.locator(".leader-row")).toHaveCount(20);
  await page.goto("/privacy");
  const consent = page.getByRole("checkbox");
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(
    page.getByText("Preference saved on this browser."),
  ).toBeVisible();
  const response = await page.request.post("/api/analytics", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { event: "share_copied" },
  });
  expect(response.status()).toBe(204);
  expect(
    (
      await page.request.post("/api/analytics", {
        headers: { Origin: "http://other.test" },
        data: { event: "share_copied" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/analytics", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { event: "bad_event" },
      })
    ).status(),
  ).toBe(400);
  await consent.uncheck();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  // Promote only this generated local test account; test server guards and editing paths.
  runSql(
    `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Make tomorrow’s choice." }),
  ).toBeVisible();
  await page.getByLabel("K-factor (future votes)").fill("24");
  // Long song options must not widen the mobile layout or zoom its hit targets.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "Save K-factor" }).click();
  await expect(
    page.getByText("K-factor saved for future votes."),
  ).toBeVisible();
  const editor = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Song editor", exact: true }),
  });
  await editor.getByText("Open song editor", { exact: true }).click();
  const id = `test-song-${Date.now()}`;
  await editor.getByLabel("Song ID", { exact: true }).fill(id);
  await editor.getByLabel("Title", { exact: true }).fill("Editor test song");
  await editor.getByLabel("Artist", { exact: true }).fill("Test artist");
  await editor.getByLabel("Release year", { exact: true }).fill("2000");
  await editor.getByLabel("Release date (optional)").fill("2000-02-29");
  await editor.getByLabel("Duration in milliseconds (optional)").fill("180000");
  await editor
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("disabled");
  await editor.getByRole("button", { name: "Save song", exact: true }).click();
  await expect(page.getByText("Song saved.", { exact: true })).toBeVisible();
  const importedId = `csv-song-${Date.now()}`;
  const csv = `id,title,artistName,albumName,releaseYear,status,providers\n${importedId},CSV test song,Test artist,Single,2001,disabled,[]`;
  await page.getByText("Open bulk import", { exact: true }).click();
  await page.getByLabel("Import format").selectOption("csv");
  await page.getByLabel("Catalog file (optional)").setInputFiles({
    name: "catalog.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Save catalog", exact: true }).click();
  await expect(page.getByText("1 songs saved.", { exact: true })).toBeVisible();
  expect(
    runSql(`select title||','||status from songs where id='${importedId}'`),
  ).toBe("CSV test song,disabled");
  await page
    .getByRole("button", { name: "Queue next ten days", exact: true })
    .click();
  await expect(
    page.getByText(
      /\d+ editorial matchups added. Existing days were preserved./,
    ),
  ).toBeVisible();
  const day = new Date();
  day.setUTCDate(
    day.getUTCDate() +
      30 +
      ({ desktop: 1, webkit: 2, mobile: 3, firefox: 4 }[
        testInfo.project.name
      ] ?? 5),
  );
  const scheduledDay = day.toISOString().slice(0, 10);
  const replacement = page
    .locator('select[name="replaceId"] option')
    .filter({ hasText: scheduledDay });
  if (await replacement.count())
    await page
      .locator('select[name="replaceId"]')
      .selectOption((await replacement.getAttribute("value"))!);
  await page.getByLabel("Musicale day (UTC)").fill(scheduledDay);
  await page
    .getByRole("combobox", { name: "Song A", exact: true })
    .selectOption("respect-aretha");
  await page
    .getByRole("combobox", { name: "Song B", exact: true })
    .selectOption("god-only-knows");
  await page.getByRole("button", { name: "Save matchup", exact: true }).click();
  await expect(page.getByText("Matchup saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: `Cancel ${scheduledDay} matchup`,
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Matchup cancelled.", { exact: true }),
  ).toBeVisible();
  expect(
    runSql(
      `select status from daily_matchups where matchup_day='${scheduledDay}'`,
    ),
  ).toBe("cancelled");
  const today = new Date().toISOString().slice(0, 10);
  const featured = page.getByRole("checkbox", {
    name: `Feature ${today} after voting closes`,
    exact: true,
  });
  await featured.check();
  await featured
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save feature", exact: true })
    .click();
  await expect(
    page.getByText("Featured setting saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Rebuild all derived rankings from the recorded events.")
    .check();
  await page
    .getByRole("button", { name: "Rebuild rankings", exact: true })
    .click();
  await expect(
    page.getByText(/Rankings rebuilt from \d+ recorded votes/),
  ).toBeVisible();
  await page.screenshot({
    path: `output/${testInfo.project.name}-admin.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `output/${testInfo.project.name}-admin-viewport.png`,
  });
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
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/today");
  await expect(page.locator(".result")).toHaveCount(0);
});

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
