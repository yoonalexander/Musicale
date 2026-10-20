import { test, firstVisit as it, expect } from "./fixtures";
import {
  runSql,
  signIn,
  dismissPlayTutorial,
  seedRankEvidence,
} from "../browser-helpers";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";

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

it("welcome Play remembers YouTube consent across every mode and Privacy can revoke it in other tabs", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  let scripts = 0;
  let analytics = 0;
  await context.route("https://www.youtube.com/iframe_api", (route) => {
    scripts++;
    return route.fulfill({ contentType: "text/javascript", body: api });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/analytics") analytics++;
  });
  await page.goto("/");
  await expect(page.locator(".youtube-consent-notice")).toContainText(
    "allow YouTube players to load automatically across Musicale",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toHaveAttribute("aria-describedby", "youtube-entry-notice");
  expect(scripts).toBe(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".welcome-overlay")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator("form.matchup, .play-ready").first()).toBeVisible();
  await expect(page).toHaveURL("/");
  const uid = runSql(
    "select id from auth.users where is_anonymous order by created_at desc limit 1",
  );
  seedRankEvidence(uid);
  if (!(await page.locator('input[name="roundId"]').count()))
    await page.getByRole("button", { name: "Try again", exact: true }).click();
  await dismissPlayTutorial(page);
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("musicale-youtube-consent-v1"),
    ),
  ).toBe("yes");
  expect(
    await page.evaluate(() => localStorage.getItem("musicale-analytics")),
  ).toBeNull();

  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  const pair = await page.locator('input[name="comparisonId"]').inputValue();
  const oldPlayers = await page.evaluate("window.__youtubePlayers.length");
  await page
    .locator('form.matchup button[name="selectedSongId"]')
    .first()
    .click();
  await expect(page.locator('input[name="comparisonId"]')).not.toHaveValue(
    pair,
  );
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(
        `window.__youtubePlayers.slice(0,${oldPlayers}).every(player => player.destroyed)`,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      "window.__youtubePlayers.filter(player => !player.destroyed).every(player => player.options.playerVars.autoplay === 0)",
    ),
  ).toBe(true);

  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL("/rank");
  await expect(page.locator('input[name="comparisonId"]')).toHaveCount(1);
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await page.goto("/songs/dynamite-bts");
  await expect(page.locator(".video-preview iframe")).toHaveCount(1);
  const privacy = await context.newPage();
  await privacy.goto("/privacy");
  const choice = privacy.getByRole("checkbox", {
    name: "Allow YouTube players to load automatically",
    exact: true,
  });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toBeVisible();
  await choice.check();
  await expect(page.locator(".video-preview iframe")).toHaveCount(1);
  await choice.uncheck();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
  await page.evaluate(() =>
    sessionStorage.removeItem("musicale-entry-session-v1"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".welcome-overlay")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator("form.matchup, .play-ready").first()).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("musicale-youtube-consent-v1"),
    ),
  ).toBe("no");
  expect(analytics).toBe(0);
});

it("YouTube consent works for the current visit when browser storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "musicale-youtube-consent-v1")
        throw new Error("Storage blocked");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "musicale-youtube-consent-v1")
        throw new Error("Storage blocked");
      return set.call(this, key, value);
    };
  });
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: api }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".welcome-overlay")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator("form.matchup, .play-ready").first()).toBeVisible();
  await expect(page).toHaveURL("/");
  await dismissPlayTutorial(page);
  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL("/rank");
  await expect(page.locator('input[name="comparisonId"]')).toHaveCount(1);
  await expect(page.locator(".video-preview iframe")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(2);
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
});

test("YouTube permission can be revoked for this visit even if storage becomes read-only", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musicale-youtube-consent-v1", "yes");
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "musicale-youtube-consent-v1")
        throw new Error("Read-only storage");
      return set.call(this, key, value);
    };
  });
  await page.goto("/privacy");
  const choice = page.getByRole("checkbox", {
    name: "Allow YouTube players to load automatically",
    exact: true,
  });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await expect(choice).not.toBeChecked();
  await expect(
    page.getByText(
      "Preference changed for this visit. This browser could not save it.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL("/rank");
  await expect(page.locator('input[name="comparisonId"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(2);
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
});

test("revoking YouTube consent cancels players still waiting for the API", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("musicale-youtube-consent-v1", "yes"),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    await pending;
    await route.fulfill({ contentType: "text/javascript", body: api });
  });
  try {
    await page.goto("/rank", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Loading YouTube player…", { exact: true }),
    ).toHaveCount(2);
    const privacy = await context.newPage();
    await privacy.goto("/privacy");
    await privacy
      .getByRole("checkbox", {
        name: "Allow YouTube players to load automatically",
        exact: true,
      })
      .uncheck();
    await expect(
      page.getByRole("button", { name: "Load YouTube player", exact: true }),
    ).toHaveCount(2);
    release();
    await expect
      .poll(() => page.evaluate("Boolean(window.YT?.Player)"))
      .toBe(true);
    await expect(page.locator(".video-preview iframe")).toHaveCount(0);
    expect(await page.evaluate("window.__youtubePlayers.length")).toBe(0);
  } finally {
    release();
  }
});

test("saved-video validation is reused when the Rank page refreshes", async ({
  page,
  request,
}, info) => {
  const requests = () =>
    existsSync("tmp/youtube-fixture-requests.log")
      ? readFileSync("tmp/youtube-fixture-requests.log", "utf8")
          .trim()
          .split("\n")
          .filter(Boolean).length
      : 0;
  await signIn(
    page,
    request,
    `youtube-quota-${Date.now()}-${info.project.name}@example.test`,
  );
  await page.goto("/rank");
  await expect(page.locator("form.matchup")).toBeVisible();
  await page.reload();
  const before = requests();
  await page.reload();
  await page.waitForTimeout(1000);
  expect(requests()).toBe(before);
});

it("current welcome keeps Play and access to Privacy and Help", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Musicale" })).toBeVisible();
  await expect(page.locator(".welcome-promise")).toHaveText(
    "Two songs.One good instinct.",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Privacy & preferences" }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    page.getByRole("link", { name: "Help & music credits", exact: true }),
  ).toHaveAttribute("href", "/help");
  await page.screenshot({
    path: `output/${info.project.name}-youtube-current-welcome.png`,
    fullPage: true,
  });
});

test("Rank automatically includes YouTube songs", async ({
  page,
  request,
}, info) => {
  await signIn(
    page,
    request,
    `youtube-listen-${Date.now()}-${info.project.name}@example.test`,
  );
  await page.goto("/rank");
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(2);
  const pair = await page.locator('input[name="comparisonId"]').inputValue();
  expect(
    runSql(`select preview_only from rank_comparisons where id='${pair}'`),
  ).toBe("f");
});

for (const mode of ["rank", "play"] as const) {
  test(`YouTube in ${mode}: controls never submit votes and saved progression disposes players`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(120000);
    await page.route("https://www.youtube.com/iframe_api", (route) =>
      route.fulfill({ contentType: "text/javascript", body: api }),
    );
    const email = `youtube-${mode}-${Date.now()}-${info.project.name}@example.test`;
    await signIn(page, request, email);
    const uid = runSql(`select id from auth.users where email='${email}'`);
    if (mode === "play") seedRankEvidence(uid);
    await page.goto(`/${mode}`);

    if (mode === "play") await dismissPlayTutorial(page);
    const form = page.locator("form.matchup"),
      identity = form.locator(
        `input[name="${mode === "rank" ? "comparisonId" : "roundId"}"]`,
      ),
      pair = await identity.inputValue();
    let submissions = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === `/${mode}`)
        submissions++;
    });
    await form
      .getByRole("button", { name: "Load YouTube player", exact: true })
      .first()
      .click();
    await expect(form.locator(".video-preview iframe")).toHaveCount(1);
    await page.evaluate("window.__youtubePlayers[0].emit(1)");
    await expect(
      page.getByText("Playing on YouTube. Ads may play before the song."),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const box = await form.locator(".video-preview iframe").boundingBox();
      // Mobile DOM rectangles can round a 200px CSS minimum just below 200.
      expect(box!.width + 0.001).toBeGreaterThanOrEqual(200);
      expect(box!.height + 0.001).toBeGreaterThanOrEqual(200);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize(
      info.project.use.viewport ?? { width: 1280, height: 720 },
    );
    await expect(form.locator('button[name="selectedSongId"]')).toHaveCount(2);
    await page.evaluate(
      "window.__youtubePlayers[0].options.events.onError({ target: window.__youtubePlayers[0], data: 150 })",
    );
    await page.getByRole("button", { name: "Retry YouTube player" }).click();
    await expect(form.locator(".video-preview iframe")).toHaveCount(1);
    expect(submissions).toBe(0);
    await expect(identity).toHaveValue(pair);
    if (mode === "play") {
      const selected = runSql(
        `select case when rating_a>rating_b then song_a_id else song_b_id end from play_rounds where id='${pair}'`,
      );
      await form
        .locator(`button[name="selectedSongId"][value="${selected}"]`)
        .click();
      await expect(
        page.getByRole("heading", { name: "Correct!", exact: true }),
      ).toBeVisible();
    } else {
      await form.locator('button[name="selectedSongId"]').first().click();
      if (mode === "rank")
        await expect(
          page.getByText("Your preference is saved.", { exact: false }),
        ).toBeVisible();
      else
        await expect(
          page.getByText("Vote recorded", { exact: true }),
        ).toBeVisible();
    }
    {
      await expect(identity).not.toHaveValue(pair);
      await expect
        .poll(() =>
          page.evaluate("window.__youtubePlayers.every(p => p.destroyed)"),
        )
        .toBe(true);
      await expect(form.locator(".video-preview iframe")).toHaveCount(0);
    }
    await page.screenshot({
      path: `output/${info.project.name}-youtube-${mode}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test("YouTube discovery preserves unsaved catalog edits, recovers quota errors and saves through the current editor", async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const email = `youtube-editor-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  runSql(`update profiles set role='admin' where user_id='${uid}'`);
  await page.goto("/admin");
  await page.getByText("Open song editor", { exact: true }).click();
  await page
    .getByLabel("Edit a song or add a new one")
    .selectOption("respect-aretha");
  const editor = page
    .locator("form.admin-form")
    .filter({ has: page.locator('input[name="youtubeId"]') });
  await editor.getByLabel("Album", { exact: true }).fill("Unsaved album edit");
  const discovery = page.getByRole("region", {
    name: "YouTube recording discovery",
  });
  await discovery.getByLabel("Playback country (two-letter code)").fill("ZZ");
  await discovery
    .getByRole("button", { name: "Search YouTube candidates" })
    .click();
  await expect(discovery.getByRole("alert")).toContainText(
    "YouTube denied the request",
  );
  await discovery.getByLabel("Playback country (two-letter code)").fill("CA");
  await discovery
    .getByRole("button", { name: "Search YouTube candidates" })
    .click();
  await expect(
    discovery.getByText("Musicale browser fixture", { exact: false }),
  ).toBeVisible();
  await discovery
    .getByRole("button", { name: "Use video ID JzqGZjFnYnA" })
    .click();
  await expect(editor.locator('input[name="youtubeId"]')).toHaveValue(
    "JzqGZjFnYnA",
  );
  await expect(editor.getByLabel("Album", { exact: true })).toHaveValue(
    "Unsaved album edit",
  );
  await editor
    .getByLabel("Album", { exact: true })
    .fill("I Never Loved a Man the Way I Love You");
  await editor.getByRole("button", { name: "Save song", exact: true }).click();
  await expect(page.getByText("Song saved.", { exact: false })).toBeVisible();
  expect(
    runSql(
      "select provider_song_id from song_providers where song_id='respect-aretha' and provider='youtube'",
    ),
  ).toBe("JzqGZjFnYnA");
});

test("saved YouTube songs offer in-card playback without loading third parties first", async ({
  page,
}) => {
  await page.goto("/rank");
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
  await page.goto("/rank");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(page.locator(".video-preview iframe")).toHaveCount(1);
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
    expect(box!.width + 0.001).toBeGreaterThanOrEqual(200);
    expect(box!.height + 0.001).toBeGreaterThanOrEqual(200);
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
  await expect
    .poll(() =>
      page.evaluate("window.__youtubePlayers.every(p => p.destroyed)"),
    )
    .toBe(true);
});

test("a blocked API can retry and unloading cancels a pending initialization", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
  await page.goto("/rank");
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
  await page.getByRole("link", { name: "Leaderboard", exact: true }).click();
  release();
  await expect
    .poll(() => page.evaluate("Boolean(window.YT?.Player)"))
    .toBe(true);
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
  await page.getByRole("link", { name: "Rank", exact: true }).click();
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
  await expect(page.locator(".video-preview iframe")).toBeVisible({
    timeout: 35000,
  });
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

test("Made for Kids players send no YouTube analytics even when product analytics is enabled", async ({
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
  await page.goto("/songs/99-luftballons-nena");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .first()
    .click();
  await expect(page.locator(".video-preview iframe")).toBeVisible({
    timeout: 35000,
  });
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

test("fresh non-kids metadata enables opted-in player events without exposing the server key", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/songs/dynamite-bts")).text();
  expect(html).not.toContain("musicale-browser-fixture");
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
  await page.goto("/songs/dynamite-bts");
  await page
    .getByRole("button", { name: "Load YouTube player", exact: true })
    .click();
  await expect(page.locator(".video-preview iframe")).toBeVisible({
    timeout: 35000,
  });
  await page.evaluate("window.__youtubePlayers[0].emit(1)");
  await expect
    .poll(() => page.evaluate("window.__analyticsEvents"))
    .toEqual(["youtube_player_ready", "youtube_play_started"]);
});
