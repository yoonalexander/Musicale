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

test("shared record loader covers Play, Rank, voting and player loading, with reduced motion", async ({
  page,
  request,
}, info) => {
  let held: Promise<void> | undefined;
  let release = () => {};
  const holdNextAction = () => {
    held = new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  await page.route("http://127.0.0.1:3101/**", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().headers()["next-action"] &&
      held
    ) {
      const pending = held;
      held = undefined;
      await pending;
    }
    await route.continue();
  });
  holdNextAction();
  try {
    await page.goto("/");
    const loader = page
      .getByRole("status")
      .filter({ hasText: "Getting your songs…" });
    await expect(loader).toBeVisible();
    const disc = loader.locator(".music-loading-disc");
    await expect(disc).toHaveCSS("animation-name", "record-spin");
    const transform = await disc.evaluate(
      (node) => getComputedStyle(node).transform,
    );
    await expect
      .poll(() => disc.evaluate((node) => getComputedStyle(node).transform))
      .not.toBe(transform);
    await expect(page.locator("form.matchup")).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `output/${info.project.name}-play-loading.png`,
      fullPage: true,
    });
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(disc).toHaveCSS("animation-name", "none");
    await expect(loader).toHaveText("Getting your songs…");
    release();
    const choices = page.locator('form.matchup button[name="selectedSongId"]');
    await expect(choices).toHaveCount(2);
    await expect(loader).toHaveCount(0);
    holdNextAction();
    const vote = choices.first().click();
    await expect(choices.first()).toBeDisabled();
    await expect(choices.locator(".music-loading--compact")).toHaveCount(2);
    await expect(choices.first().locator(".music-loading-disc")).toHaveCSS(
      "animation-name",
      "none",
    );
    release();
    await vote;
    await expect(page.getByLabel("Run score")).toHaveText("Run Score: 1");
    await request.get("http://127.0.0.1:55329/__fixture/rank-reset");
    holdNextAction();
    await page.goto("/rank");
    const rankingLoader = page
      .getByRole("status")
      .filter({ hasText: "Finding your songs…" });
    await expect(rankingLoader).toBeVisible();
    await expect(rankingLoader.locator(".music-loading-disc")).toHaveCSS(
      "animation-name",
      "none",
    );
    release();
    await expect(choices).toHaveCount(2);
    await expect(rankingLoader).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const comparison = page.locator('input[name="comparisonId"]');
    const previous = await comparison.inputValue();
    holdNextAction();
    const rankVote = choices.first().click();
    await expect(choices.first()).toBeDisabled();
    await expect(choices.locator(".music-loading--compact")).toHaveCount(2);
    await expect(choices.first().locator(".music-loading-disc")).toHaveCSS(
      "animation-name",
      "record-spin",
    );
    release();
    await rankVote;
    await expect(comparison).not.toHaveValue(previous);
    let releasePlayer!: () => void;
    const playerHeld = new Promise<void>((resolve) => {
      releasePlayer = resolve;
    });
    await page.unroute("https://www.youtube.com/iframe_api");
    await page.route("https://www.youtube.com/iframe_api", async (route) => {
      await playerHeld;
      await route.abort();
    });
    try {
      await page
        .getByRole("button", { name: "Load YouTube player", exact: true })
        .first()
        .click();
      const playerStatus = page.locator(
        ".video-preview .music-loading--compact",
      );
      await expect(playerStatus).toHaveText("Loading YouTube player…");
      await expect(playerStatus.locator(".music-loading-disc")).toHaveCSS(
        "animation-name",
        "record-spin",
      );
    } finally {
      releasePlayer();
    }
    await expect(
      page.getByRole("button", { name: "Retry YouTube player" }),
    ).toBeVisible();
  } finally {
    release();
  }
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
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 0");
  const first = await round.inputValue();
  await choices.first().click();
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 1");
  await expect(round).not.toHaveValue(first);
  const scored = await round.inputValue();
  await page.reload();
  await expect(round).not.toHaveValue(scored);
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 0");
  const beforeClose = await round.inputValue();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  const freshRound = reopened.locator('input[name="roundId"]');
  await expect(freshRound).not.toHaveValue(beforeClose);
  await expect(reopened.getByLabel("Run score")).toHaveText("Run Score: 0");
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

test("Play shows themed correct and loss results with captured ratings and starts a new run on replay", async ({
  page,
}, info) => {
  await page.goto("/");
  const choices = page.locator('form.matchup button[name="selectedSongId"]');
  const score = page.locator(".play-score");
  await expect(choices).toHaveCount(2);
  await expect(score).toHaveText("Run Score: 0");
  await choices.first().click();
  await expect(score).toHaveText("Run Score: 1");
  const correct = page.locator(".play-result");
  await expect(
    correct.getByRole("heading", { name: "Correct!", exact: true }),
  ).toBeFocused();
  await expect(correct.getByRole("status")).toHaveText("+1 point");
  await expect(correct).not.toContainText(/Score after|These were the ratings/);
  await expect(correct.locator(".play-result-song").first()).toContainText(
    "Your pick · Higher rated",
  );
  await expect(correct.locator(".play-result-song").first()).toContainText(
    "Respect",
  );
  await expect(correct).toContainText("1512 Elo");
  await expect(correct).toContainText("1488 Elo");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-play-correct.png`,
    fullPage: true,
  });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize(originalViewport);
  await choices.last().click();
  const result = page.getByRole("region", { name: "Saved answer" });
  await expect(
    result.getByRole("heading", { name: "Run complete", exact: true }),
  ).toBeFocused();
  await expect(score).toHaveText("Run Score: 1");
  await expect(page.locator("form.matchup, .play-ready")).toHaveCount(0);
  await expect(result).not.toContainText(/Score after|Ready for another run/);
  await expect(result.locator(".is-higher")).toContainText("Respect");
  await expect(result.locator(".is-higher")).toContainText("1512 Elo");
  await expect(result.locator(".play-loss-song:not(.is-higher)")).toContainText(
    "Your pick",
  );
  await expect(result.locator(".play-loss-song:not(.is-higher)")).toContainText(
    "God Only Knows",
  );
  await expect(result.locator(".play-loss-song:not(.is-higher)")).toContainText(
    "1488 Elo",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `output/${info.project.name}-play-loss.png`,
    fullPage: true,
  });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    result.getByRole("button", { name: "Play again", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize(viewport);
  await result.getByRole("button", { name: "Play again", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(choices).toHaveCount(2);
  await expect(score).toHaveText("Run Score: 0");
  await expect(result).toHaveCount(0);
  await choices.last().click();
  await expect(
    result.getByRole("heading", { name: "Run complete", exact: true }),
  ).toBeFocused();
  await expect(score).toHaveText("Run Score: 0");
});
