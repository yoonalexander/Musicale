import { test, expect } from "@playwright/test";

// Exercise our lifecycle and events without depending on ads, region or YouTube uptime.
const api = `
window.__youtubePlayers = [];
window.YT = { Player: class {
  constructor(mount, options) {
    this.options = options;
    this.iframe = document.createElement('iframe');
    this.iframe.src = 'about:blank';
    this.iframe.style.width = options.width;
    this.iframe.style.height = options.height + 'px';
    mount.replaceWith(this.iframe);
    window.__youtubePlayers.push(this);
    setTimeout(() => options.events.onReady({ target: this }), 0);
  }
  getIframe() { return this.iframe; }
  emit(data) { this.options.events.onStateChange({ target: this, data }); }
  pauseVideo() { this.pauses = (this.pauses || 0) + 1; this.emit(2); }
  destroy() { this.destroyed = true; this.iframe.remove(); }
}};
window.onYouTubeIframeAPIReady();
`;

test("saved YouTube songs offer in-card playback without loading third parties first", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(
    page.getByRole("button", { name: "Load YouTube player" }),
  ).toHaveCount(2);
  await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
  await expect(
    page.locator('script[src="https://www.youtube.com/iframe_api"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Listen on YouTube" }),
  ).toHaveCount(2);
});

test("players share one API, pause each other, recover errors and dispose on navigation", async ({
  page,
}) => {
  let scripts = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    scripts++;
    return route.fulfill({ contentType: "text/javascript", body: api });
  });
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Ready. Press play in the YouTube player."),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      "window.__youtubePlayers[0].options.playerVars.autoplay",
    ),
  ).toBe(0);
  await page.evaluate("window.__youtubePlayers[0].emit(1)");
  await expect(
    page.getByText("Playing on YouTube. Ads may play before the song."),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .click();
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await page.evaluate("window.__youtubePlayers[1].emit(1)");
  expect(await page.evaluate("window.__youtubePlayers[0].pauses")).toBe(1);
  for (const iframe of await page.locator(".video-preview iframe").all()) {
    const box = await iframe.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.height).toBeGreaterThanOrEqual(200);
    await expect(iframe).toHaveAttribute("title", /^YouTube player:/);
    await expect(iframe).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
  }
  await page.evaluate(
    "window.__youtubePlayers[1].options.events.onError({ target: window.__youtubePlayers[1], data: 101 })",
  );
  await expect(
    page.getByText("This video cannot be embedded here."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Listen on YouTube" }),
  ).toHaveCount(2);
  await expect(page.locator(".video-preview iframe")).toHaveCount(1);
  await page.getByRole("button", { name: "Retry YouTube player" }).click();
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  expect(scripts).toBe(1);
  await page.getByRole("link", { name: "Leaderboard", exact: true }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  expect(
    await page.evaluate("window.__youtubePlayers.every(p => p.destroyed)"),
  ).toBe(true);
});

test("a blocked API can retry and unloading cancels a pending initialization", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(
    page.getByText(
      "YouTube could not load. Check your connection or use the link below.",
    ),
  ).toBeVisible();
  await page.unroute("https://www.youtube.com/iframe_api");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    await pending;
    await route.fulfill({ contentType: "text/javascript", body: api });
  });
  await page.getByRole("button", { name: "Retry YouTube player" }).click();
  await expect(page.getByText("Loading YouTube player…")).toBeVisible();
  await page.getByRole("button", { name: "Unload YouTube player" }).click();
  release();
  await expect
    .poll(() => page.evaluate("Boolean(window.YT?.Player)"))
    .toBe(true);
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(page.locator(".video-preview iframe")).toHaveCount(1);
  expect(await page.evaluate("window.__youtubePlayers.length")).toBe(1);
});

test("real catalog video reaches YouTube PLAYING after a native play gesture", async ({
  page,
}) => {
  test.skip(
    process.env.MUSICALE_REAL_YOUTUBE !== "1",
    "Explicit network smoke test; never substitute mocked events for playback evidence.",
  );
  test.setTimeout(90000);
  await page.goto("/songs/dynamite-bts");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Ready. Press play in the YouTube player."),
  ).toBeVisible({ timeout: 35000 });
  const iframe = page.frameLocator(".video-preview iframe").first();
  await iframe.getByRole("button", { name: /play/i }).first().click();
  await expect(
    page.getByText("Playing on YouTube. Ads may play before the song."),
  ).toBeVisible({ timeout: 35000 });
  await page.screenshot({
    path: "output/youtube-real-playback.png",
    fullPage: true,
  });
});

test("unverified players send no YouTube analytics even when product analytics is enabled", async ({
  page,
}) => {
  await page.addInitScript(`
    localStorage.setItem('musicale-analytics', 'yes');
    window.__analyticsEvents = [];
    const originalFetch = window.fetch;
    window.fetch = function(input, options) {
      if (input === '/api/analytics') {
        window.__analyticsEvents.push(JSON.parse(options.body).event);
        return Promise.resolve(new Response(null, {status: 204}));
      }
      return originalFetch.apply(this, arguments);
    };
  `);
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: api }),
  );
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Ready. Press play in the YouTube player."),
  ).toBeVisible();
  await page.evaluate("window.__youtubePlayers[0].emit(1)");
  await expect(
    page.getByText("Playing on YouTube. Ads may play before the song."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      "window.__analyticsEvents.filter(event => event.startsWith('youtube_'))",
    ),
  ).toEqual([]);
});
