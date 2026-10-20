import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("musicale-play-tutorial-v1", "seen"),
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
});

test("Rank loads a pair without a start button, keeps it on refresh and explains ranking in a themed dialog", async ({
  page,
}, info) => {
  await page.goto("/rank");
  const choices = page.locator('form.matchup button[name="selectedSongId"]');
  await expect(choices).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Listen and rank", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "15-second previews only" }),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(
    /Continuous preference ranking|Pick your favorite\. Both songs|This pair expires|visit Daily/,
  );
  const pair = await page.locator('input[name="comparisonId"]').inputValue();
  await page.reload();
  await expect(page.locator('input[name="comparisonId"]')).toHaveValue(pair);
  await choices.first().click();
  await expect(page.locator('input[name="comparisonId"]')).not.toHaveValue(
    pair,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  const trigger = page.getByRole("button", {
    name: "How ranking works",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "How ranking works" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "Your vote updates both songs’ Elo ratings",
  );
  await expect(dialog).toHaveCSS("animation-name", "tutorial-fade-in");
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 250, 240)");
  await expect(
    dialog.getByRole("button", { name: "Let’s rank" }),
  ).toBeInViewport();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-ranking-dialog.png`,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(dialog).toHaveCSS("animation-name", "none");
});

test("leaderboard page sizes, YouTube links, filter geometry, unranked labels and footer", async ({
  page,
}, info) => {
  await page.goto("/leaderboard");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  const size = page.getByRole("combobox", {
    name: "Songs per page",
    exact: true,
  });
  for (const count of [25, 50, 100, 500]) {
    await size.selectOption(String(count));
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(size).toHaveValue(String(count));
    await expect(page.locator(".leader-row")).toHaveCount(
      Math.min(
        count,
        Number(
          (await page.locator(".pagination").innerText()).match(
            /(\d+) songs/,
          )?.[1] ?? 0,
        ),
      ),
    );
  }
  await expect(page.locator(".leader-row .unranked").first()).toHaveText(
    "unranked",
  );
  const link = page.locator(".leader-row .leader-listen").first();
  await expect(link).toHaveText("Listen on YouTube ↗");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute(
    "href",
    /^https:\/\/(www\.)?youtube\.com\//,
  );
  await expect(page.locator('.site-header a[href="/today"]')).toHaveCount(0);
  await expect(page.locator(".leaderboard")).not.toContainText("Kevin MacLeod");
  await page.getByLabel("Artist", { exact: true }).focus();
  await expect(page.getByLabel("Artist", { exact: true })).toHaveCSS(
    "outline-offset",
    "-3px",
  );
  const apply = await page
    .getByRole("button", { name: "Apply", exact: true })
    .boundingBox();
  const clear = await page
    .getByRole("link", { name: "Clear filters", exact: true })
    .boundingBox();
  expect(Math.abs(apply!.y - clear!.y)).toBeLessThan(2);
  if (page.viewportSize()!.width > 760) {
    const decade = await page
      .getByRole("combobox", { name: "Decade", exact: true })
      .boundingBox();
    expect(Math.abs(apply!.y - decade!.y)).toBeLessThan(2);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const footer = await page.locator("footer").evaluate((element) => {
    const brand = element.querySelector("span")!.getBoundingClientRect();
    const nav = element.querySelector("nav")!.getBoundingClientRect();
    return {
      brandRight: brand.right,
      navLeft: nav.left,
      justification: getComputedStyle(element.querySelector("nav")!)
        .justifyContent,
    };
  });
  expect(footer.navLeft).toBeGreaterThan(footer.brandRight);
  expect(footer.justification).toBe("flex-end");
  await page.screenshot({
    path: `output/${info.project.name}-leaderboard.png`,
  });
  await size.selectOption("25");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  if (await page.getByRole("link", { name: "Next", exact: true }).count()) {
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/pageSize=25.*page=2/);
    await expect(size).toHaveValue("25");
  }
});

test("Play has a larger VS and fading tutorial, and Daily redirects to Play", async ({
  page,
}, info) => {
  // Rank creates a guest session; Play must replace any existing run on entry.
  await page.goto("/rank");
  await expect(page.locator("form.matchup")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("form.matchup")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /Unlimited runs|Trust your instinct\. Choose one\.|Ratings are locked|Expiry preserves|Unload YouTube player|Ready\. Press play/,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await expect(page.locator(".mode-switch")).toHaveCount(0);
  const versus = await page.locator(".versus").boundingBox();
  expect(versus!.width).toBeGreaterThanOrEqual(46);
  await page.getByRole("button", { name: "How to play", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "How to play" });
  await expect(dialog).toHaveCSS("animation-name", "tutorial-fade-in");
  await expect(dialog).not.toContainText(/Daily|15-second/);
  await page.screenshot({
    path: `output/${info.project.name}-play-dialog.png`,
  });
  await dialog.getByRole("button", { name: "Let’s play" }).click();
  const response = await page.request.get("/today", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/");
  expect((await page.request.get("/audio/64738758.mp3")).status()).toBe(404);
  await page.goto("/today");
  await expect(page).toHaveURL("/");
});

test("Play starts fresh on reload, a new tab, and restored navigation; unavailable pairs never offer resume", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  const round = page.locator('input[name="roundId"]');
  const choices = page.locator('form.matchup button[name="selectedSongId"]');
  await expect(choices).toHaveCount(2);
  await expect(page.getByLabel("Run score")).toHaveText("Run score: 0");
  const first = await round.inputValue();
  await choices.first().click();
  await expect(page.getByLabel("Run score")).toHaveText("Run score: 1");
  await expect(round).not.toHaveValue(first);
  const scored = await round.inputValue();
  await page.reload();
  await expect(round).not.toHaveValue(scored);
  await expect(page.getByLabel("Run score")).toHaveText("Run score: 0");
  const beforeClose = await round.inputValue();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  const freshRound = reopened.locator('input[name="roundId"]');
  await expect(freshRound).not.toHaveValue(beforeClose);
  await expect(reopened.getByLabel("Run score")).toHaveText("Run score: 0");
  const beforeRestore = await freshRound.inputValue();
  await reopened.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(freshRound).not.toHaveValue(beforeRestore);
  try {
    await request.get(
      "http://127.0.0.1:55329/__fixture/play-available?value=false",
    );
    await reopened.reload();
    await expect(
      reopened.getByRole("heading", { name: "No matchup available right now" }),
    ).toBeVisible();
    await expect(reopened.locator("main")).not.toContainText(
      /Resume run|Run paused|Points preserved|End this run and start over/,
    );
    await expect(
      reopened.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
  } finally {
    await request.get(
      "http://127.0.0.1:55329/__fixture/play-available?value=true",
    );
  }
});
