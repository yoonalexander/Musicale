import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test.use({ entryAcknowledged: false });

for (const path of [
  "/",
  "/play",
  "/rank",
  "/today",
  "/songs/dynamite-bts",
  "/leaderboard",
  "/archive",
]) {
  test(`fresh entry at ${path} cannot skip the welcome overlay and keeps the URL`, async ({
    page,
  }, info) => {
    let youtube = 0;
    await page.addInitScript(() =>
      localStorage.setItem("musicale-youtube-consent-v1", "yes"),
    );
    await page.route("https://www.youtube.com/iframe_api", (route) => {
      youtube++;
      return route.abort();
    });
    await page.goto(path);
    const welcome = page.getByRole("dialog", { name: "Musicale" });
    await expect(welcome).toBeVisible();
    for (const selector of [
      ".matchup",
      ".video-preview",
      ".play-ready",
      ".leader-row",
    ])
      await expect(page.locator(selector).first()).not.toBeVisible();
    await expect(page.locator(".video-preview iframe")).toHaveCount(0);
    expect(youtube).toBe(0);
    const play = welcome.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(welcome).toBeVisible();
    await welcome.getByRole("link", { name: "Help & music credits" }).focus();
    await page.keyboard.press("Tab");
    await expect(play).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (path === "/")
      await page.screenshot({
        path: `output/${info.project.name}-entry-overlay.png`,
        fullPage: true,
      });
    await play.click();
    await expect(welcome).toHaveCount(0, { timeout: 15000 });
    await expect(page).toHaveURL(path);
    if (path === "/" || path === "/play")
      await expect(page.locator(".play-score")).toBeVisible();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("musicale-entry-session-v1"),
      ),
    ).toBe("yes");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("musicale-youtube-consent-v1"),
      ),
    ).toBe("yes");
    expect(
      await page.evaluate(() => localStorage.getItem("musicale-analytics")),
    ).toBeNull();
    await page.reload();
    await expect(welcome).toHaveCount(0);
    await expect(page).toHaveURL(path);
  });
}

test("Privacy stays accessible before entry, and opting out survives Play on a direct link", async ({
  page,
}) => {
  let youtube = 0;
  await page.addInitScript(() =>
    localStorage.setItem("musicale-youtube-consent-v1", "yes"),
  );
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    youtube++;
    return route.abort();
  });
  await page.goto("/today");
  await page.getByRole("link", { name: "Privacy & preferences" }).click();
  await expect(page).toHaveURL("/privacy");
  expect(youtube).toBe(0);
  const preference = page.getByRole("checkbox", {
    name: "Allow YouTube players to load automatically",
    exact: true,
  });
  await preference.check();
  await preference.uncheck();
  await page.getByRole("link", { name: "Daily", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("dialog", { name: "Musicale" })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load YouTube player", exact: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("musicale-youtube-consent-v1"),
    ),
  ).toBe("no");
  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Musicale" })).toHaveCount(0);
});

test("blocked session storage keeps entry for navigation but asks again after a reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "musicale-entry-session-v1") throw new Error("blocked");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "musicale-entry-session-v1") throw new Error("blocked");
      return set.call(this, key, value);
    };
  });
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.abort(),
  );
  await page.goto("/rank");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("link", { name: "Daily", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("dialog", { name: "Musicale" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Musicale" })).toBeVisible();
  await expect(page.locator(".video-preview").first()).not.toBeVisible();
  await expect(page.locator(".video-preview iframe")).toHaveCount(0);
});
