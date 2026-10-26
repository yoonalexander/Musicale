import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

async function settleMotion(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function audit(page: Page, tags = ["wcag2a", "wcag2aa"]) {
  await settleMotion(page);
  return (await new AxeBuilder({ page }).withTags(tags).analyze()).violations;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("musicale-play-tutorial-v1", "seen"),
  );
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
});

test("view changes animate while Play advances rounds and retains the other song; reduced motion stays immediate", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const events: string[] = [];
    Object.assign(window, { musicaleMotionEvents: events });
    document.addEventListener("animationstart", (event) =>
      events.push(event.animationName),
    );
  });
  await page.goto("/");
  const cards = page.locator(".song-choice");
  const choices = page.locator('form.matchup button[name="selectedSongId"]');
  await expect(choices).toHaveCount(2);
  await expect(cards.first()).toHaveCSS("animation-name", "card-arrive");
  await settleMotion(page);
  const retainedSongId = await choices.last().getAttribute("value");
  const replaced = await cards.first().elementHandle();
  const count = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { musicaleMotionEvents: string[] }
        ).musicaleMotionEvents.filter((name) => name === "feedback-arrive")
          .length,
    );
  const before = await count();
  await choices.first().click();
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 1");
  // Each round remounts the form to reset its action state.
  await expect(choices.last()).toHaveAttribute("value", retainedSongId!);
  expect(await replaced!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(
    cards.first().getByRole("heading", { name: "Dreams", exact: true }),
  ).toBeVisible();
  await expect.poll(count).toBe(before + 1);
  await choices.first().click();
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 2");
  await expect.poll(count).toBe(before + 2);
  await expect(
    page.getByRole("heading", { name: "Correct!", exact: true }),
  ).toBeFocused();
  await choices.last().click();
  await expect(page.locator(".play-loss")).toHaveCSS(
    "animation-name",
    "feedback-arrive",
  );
  await expect(
    page.getByRole("heading", { name: "Run complete", exact: true }),
  ).toBeFocused();
  await settleMotion(page);
  await page.screenshot({
    path: `output/${info.project.name}-motion-result.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(choices).toHaveCount(2);
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 0");
  const previousPage = await page.locator(".page-transition").elementHandle();
  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL("/rank");
  await expect(choices).toHaveCount(2);
  expect(await previousPage!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator(".page-transition")).toHaveCSS(
    "animation-name",
    "view-arrive",
  );
  const pair = page.locator('input[name="comparisonId"]');
  const previousPair = await pair.inputValue();
  await choices.first().click();
  await expect(pair).not.toHaveValue(previousPair);
  await expect(cards.first()).toHaveCSS("animation-name", "card-arrive");
  await page
    .getByRole("button", { name: "How ranking works", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "How ranking works" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "How ranking works", exact: true }),
  ).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.locator('form.matchup input[name="roundId"]'),
  ).toBeAttached();
  await expect(choices).toHaveCount(2);
  await expect(cards.first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".page-transition")).toHaveCSS(
    "animation-name",
    "none",
  );
  await choices.first().click();
  await expect(page.getByLabel("Run score")).toHaveText("Run Score: 1");
  await expect(page.locator(".play-result")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".score-update")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(await audit(page)).toEqual([]);
});

test.describe("welcome transition", () => {
  test.use({ entryAcknowledged: false });
  test("entry fades into the game and still works with reduced motion", async ({
    page,
  }) => {
    await page.goto("/");
    const welcome = page.getByRole("dialog", { name: "Musicale" });
    await expect(welcome).toBeVisible();
    await expect(welcome).toHaveCSS("animation-name", "view-arrive");
    await welcome.getByRole("button", { name: "Play", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await expect(page.locator("form.matchup")).toBeVisible();
    await page.evaluate(() =>
      sessionStorage.removeItem("musicale-entry-session-v1"),
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(welcome).toBeVisible();
    await expect(welcome).toHaveCSS("animation-name", "none");
    await welcome.getByRole("button", { name: "Play", exact: true }).click();
    await expect(welcome).toHaveCount(0);
    await expect(page.locator("form.matchup")).toBeVisible();
  });
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
    expect(await audit(page)).toEqual([]);
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
  expect(await audit(page)).toEqual([]);
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
  expect(await audit(page)).toEqual([]);
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
  expect(await audit(page)).toEqual([]);
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
  expect(await audit(page)).toEqual([]);
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
  expect(await audit(page, ["wcag2a", "wcag2aa", "wcag21aa"])).toEqual([]);
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
  await expect(result.locator(".is-higher")).toContainText("Dreams");
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
  expect(await audit(page, ["wcag2a", "wcag2aa", "wcag21aa"])).toEqual([]);
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
