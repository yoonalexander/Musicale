import { test, expect } from "@playwright/test";
import { runSql, signIn } from "../browser-helpers";
import AxeBuilder from "@axe-core/playwright";
const respectId = "11111111-1111-4111-8111-111111111111";
const newId = "mb-22222222-2222-4222-8222-222222222222";
function cleanFixtures() {
  runSql(`delete from song_audio_sources where song_id='respect-aretha';
    delete from catalog_sources where provider_song_id='${respectId}';
    delete from song_providers where provider='musicbrainz' and provider_song_id='${respectId}';
    delete from songs where id='${newId}'`);
}
test("catalog discovery, reviewed batch import, protected refresh, audio rights and listening analytics", async ({
  page,
  request,
  context,
}, info) => {
  test.setTimeout(120000);
  const unsupportedWav =
    process.platform === "win32" && info.project.name === "webkit";
  cleanFixtures();
  const email = `catalog-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  runSql(
    `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
  );
  try {
    await page.goto("/admin");
    const discovery = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: "Discover music", exact: true }),
    });
    const capturedSearch = page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/admin",
    );
    await discovery.getByLabel("Search recordings").fill("Musicale Fixture");
    await discovery
      .getByRole("button", { name: "Search MusicBrainz", exact: true })
      .click();
    const searchPost = await capturedSearch;
    await expect(
      discovery.getByRole("heading", { name: "Respect — Aretha Franklin" }),
    ).toBeVisible();
    await expect(
      discovery.getByText("Possible duplicates: respect-aretha (metadata)"),
    ).toBeVisible();
    await expect(discovery.locator("audio,img,iframe")).toHaveCount(0);
    await discovery.screenshot({
      path: `output/${info.project.name}-catalog-discovery.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await discovery
      .getByRole("combobox", { name: "Import choice for Respect", exact: true })
      .selectOption("respect-aretha");
    await discovery
      .getByRole("combobox", {
        name: "Import choice for Fixture Signal",
        exact: true,
      })
      .selectOption("new");
    const ratings = runSql(
      "select json_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs where id not like 'mb-%') r",
    );
    await discovery
      .getByRole("button", { name: "Import selected recordings" })
      .click();
    await expect(discovery.getByRole("status")).toContainText(
      "2 recordings imported or refreshed",
    );
    expect(runSql(`select status from songs where id='${newId}'`)).toBe(
      "unavailable",
    );
    expect(
      runSql(
        "select json_agg(r order by id) from(select id,elo_rating,wins,losses,matchup_count from songs where id not like 'mb-%') r",
      ),
    ).toBe(ratings);
    await discovery
      .getByText("Imported sources and metadata refresh", { exact: true })
      .click();
    await discovery
      .getByRole("button", { name: "Refresh respect-aretha", exact: true })
      .click();
    await expect(discovery.getByRole("status")).toContainText(
      "1 recordings imported or refreshed",
    );
    expect(
      runSql(
        "select release_date is null from songs where id='respect-aretha'",
      ),
    ).toBe("t");
    await discovery.getByLabel("Search recordings").fill("Musicale Outage");
    await discovery
      .getByRole("button", { name: "Search MusicBrainz", exact: true })
      .click();
    await expect(discovery.getByRole("status")).toContainText(
      "MusicBrainz is busy",
    );

    const audioEditor = page.locator("section.panel").filter({
      has: page.getByRole("heading", {
        name: "Audio availability and authorization",
        exact: true,
      }),
    });
    await audioEditor
      .getByText("Review audio sources", { exact: true })
      .click();
    await audioEditor
      .getByLabel("Song for audio review")
      .selectOption("respect-aretha");
    await audioEditor
      .getByLabel("Audio provider", { exact: true })
      .fill("Musicale test fixture");
    await audioEditor
      .getByLabel("Audio HTTPS URL", { exact: true })
      .fill("https://audio.example.test/preview.wav");
    await audioEditor
      .getByRole("combobox", { name: "Audio availability", exact: true })
      .selectOption("available");
    await audioEditor
      .getByRole("button", { name: "Save audio source" })
      .click();
    await expect(audioEditor.getByRole("status")).toHaveText(
      "Audio source saved.",
    );
    await expect(
      audioEditor.getByText(
        "Current audio: available; permission: unreviewed.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await page.goto("/songs/respect-aretha");
    await expect(page.locator("audio")).toHaveCount(0);
    await page.goto("/admin");
    await audioEditor
      .getByText("Review audio sources", { exact: true })
      .click();
    await audioEditor
      .getByLabel("Song for audio review")
      .selectOption("respect-aretha");
    await audioEditor
      .getByRole("combobox", { name: "Audio licensing status", exact: true })
      .selectOption("authorized");
    await audioEditor
      .getByRole("button", { name: "Save audio source" })
      .click();
    await expect(audioEditor.getByRole("status")).toContainText(
      "Confirm authorization",
    );
    await audioEditor
      .getByLabel("Authorization evidence HTTPS URL")
      .fill("https://audio.example.test/license");
    await audioEditor
      .getByLabel("Audio attribution", { exact: true })
      .fill("Synthetic local test audio, not a commercial recording");
    await audioEditor.getByRole("checkbox").check();
    await audioEditor
      .getByRole("button", { name: "Save audio source" })
      .click();
    await expect(audioEditor.getByRole("status")).toHaveText(
      "Audio source saved.",
    );
    await expect(
      audioEditor.getByText(
        "Current audio: available; permission: authorized.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `output/${info.project.name}-catalog-admin.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const events: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/analytics" && r.postData())
        events.push(JSON.parse(r.postData()!).event);
    });
    await page.evaluate(() =>
      localStorage.setItem("musicale-analytics", "yes"),
    );
    let audioRequests = 0;
    const wav = Buffer.alloc(16044);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(16036, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(16000, 40);
    await page.route("https://audio.example.test/preview.wav", (route) => {
      audioRequests++;
      return route.fulfill({ contentType: "audio/wav", body: wav });
    });
    await page.goto("/today");
    if (!unsupportedWav)
      await expect(
        page.getByLabel("Preview Respect", { exact: true }),
      ).toHaveAttribute("preload", "none");
    await page.goto("/songs/respect-aretha");
    const audio = page.getByLabel("Preview Respect", { exact: true });
    if (!unsupportedWav) await expect(audio).toHaveAttribute("preload", "none");
    expect(events).not.toContain("preview_play_started");
    expect(audioRequests).toBe(0);
    if (unsupportedWav) {
      // This Windows WebKit build has no WAV decoder; exercise the real unsupported-codec fallback.
      if (await audio.count())
        await audio.evaluate((el: HTMLAudioElement) => {
          void el.play().catch(() => {});
        });
      await expect(page.getByRole("status")).toContainText(
        "Preview unavailable",
      );
      await expect
        .poll(() => events.includes("preview_play_failed"))
        .toBe(true);
      expect(events).not.toContain("preview_play_started");
    } else {
      await audio.evaluate((el: HTMLAudioElement) => el.play());
      await expect
        .poll(() => events.filter((e) => e === "preview_play_started").length)
        .toBe(1);
      await audio.evaluate((el: HTMLAudioElement) => {
        el.pause();
      });
      await audio.evaluate((el: HTMLAudioElement) => el.play());
      expect(events.filter((e) => e === "preview_play_started")).toHaveLength(
        1,
      );
    }
    await context.route("https://www.youtube.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "Local external-link fixture",
      }),
    );
    const popup = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Listen on YouTube" }).click();
    await (await popup).close();
    await expect
      .poll(() => events.includes("listening_link_clicked"))
      .toBe(true);
    await page.unroute("https://audio.example.test/preview.wav");
    await page.route("https://audio.example.test/preview.wav", (route) =>
      route.abort("failed"),
    );
    await page.reload();
    if (!unsupportedWav)
      await audio.evaluate((el: HTMLAudioElement) => {
        void el.play().catch(() => {});
      });
    await expect(page.getByRole("status")).toContainText("Preview unavailable");
    await expect.poll(() => events.includes("preview_play_failed")).toBe(true);
    await expect(
      page.getByRole("link", { name: "Listen on YouTube" }),
    ).toBeVisible();
    expect(events).not.toContain("preview_started");
    const legacyAnalytics = await page.request.post("/api/analytics", {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: { event: "preview_started" },
    });
    expect(legacyAnalytics.status()).toBe(204);
    const headers = {
      Origin: "http://127.0.0.1:3100",
      "Next-Action": searchPost.headers()["next-action"],
      "Content-Type": searchPost.headers()["content-type"],
    };
    const unauthorized = await request.post("/admin", {
      headers,
      data: searchPost.postDataBuffer()!,
    });
    expect(unauthorized.headers()["x-action-redirect"]).toMatch(
      /Admin\+access\+required/,
    );
    runSql(
      `update profiles set role='user' where user_id=(select id from auth.users where email='${email}')`,
    );
    const ordinary = await page.request.post("/admin", {
      headers,
      data: searchPost.postDataBuffer()!,
    });
    expect(ordinary.headers()["x-action-redirect"]).toMatch(
      /Admin\+access\+required/,
    );
  } finally {
    cleanFixtures();
  }
});
