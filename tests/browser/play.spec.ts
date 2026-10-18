import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import {
  runSql,
  signIn,
  dismissPlayTutorial,
  seedRankEvidence,
} from "../browser-helpers";

const latest = (uid: string) =>
  JSON.parse(
    runSql(
      `select row_to_json(c) from play_rounds c join play_runs r on r.id=c.run_id where r.user_id='${uid}' order by r.created_at desc,c.number desc limit 1`,
    ),
  );
const higher = (r: ReturnType<typeof latest>) =>
  Number(r.rating_a) > Number(r.rating_b) ? r.song_a_id : r.song_b_id;
const core = () =>
  runSql(
    `select jsonb_build_object('songs',(select jsonb_agg(to_jsonb(s) order by id) from songs s),'votes',(select jsonb_agg(to_jsonb(v) order by id) from votes v),'rank',(select jsonb_agg(to_jsonb(v) order by id) from rank_votes v),'events',(select jsonb_agg(to_jsonb(e) order by event_order) from rating_events e),'profiles',(select jsonb_agg(to_jsonb(p) order by user_id) from profiles p),'days',(select jsonb_agg(to_jsonb(d) order by id) from daily_matchups d))`,
  );

test("Play: saved runs, pending buttons, one-card progression, keyboard reveal, wrong/restart, mobile accessibility and zero ranking effects", async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  await page.goto("/play");
  await expect(
    page.getByRole("heading", { name: "Which song is higher rated?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start a run", exact: true }),
  ).toBeEnabled();
  const email = `play-browser-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  seedRankEvidence(uid);
  const before = core();
  await page.getByRole("link", { name: "Play", exact: true }).click();
  expect(runSql(`select count(*) from play_runs where user_id='${uid}'`)).toBe(
    "0",
  );
  await page.getByRole("button", { name: "Start a run", exact: true }).click();
  const form = page.locator("form.matchup"),
    buttons = form.locator('button[name="selectedSongId"]');
  await expect(buttons).toHaveCount(2);
  await dismissPlayTutorial(page);
  await expect(form).not.toContainText(/Elo|wins|losses/);
  const r = latest(uid),
    id = r.id,
    original = [r.song_a_id, r.song_b_id];
  expect(await (await page.request.get("/play")).text()).not.toMatch(
    /rating_a|rating_b|ratingA|ratingB|replacementSlot/,
  );
  await page.reload();
  await expect(form.locator('input[name="roundId"]')).toHaveValue(id);
  let release!: () => void, observed!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve)),
    intercepted = new Promise<void>((resolve) => (observed = resolve));
  await page.route("**/", async (route) => {
    if (route.request().method() === "POST") {
      observed();
      await held;
    }
    await route.continue();
  });
  const click = form.locator(`button[value="${higher(r)}"]`).click();
  await intercepted;
  await expect(buttons.nth(0)).toBeDisabled();
  await expect(buttons.nth(1)).toBeDisabled();
  release();
  await click;
  await page.unroute("**/");
  await expect(
    page.getByRole("heading", { name: "Correct!", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Run score")).toContainText("1");
  const next = latest(uid),
    fresh = [next.song_a_id, next.song_b_id];
  expect(fresh.filter((x) => original.includes(x))).toHaveLength(1);
  await expect(page.getByLabel("Saved answer")).toContainText(
    `${r.rating_a} Elo`,
  );
  const viewport = page.viewportSize()!;
  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(viewport);
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
  await page.reload();
  await expect(form.locator('input[name="roundId"]')).toHaveValue(next.id);
  await form.locator(`button[value="${higher(next)}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Run score")).toContainText("2");
  const third = latest(uid),
    wrong =
      higher(third) === third.song_a_id ? third.song_b_id : third.song_a_id;
  await expect(form.locator('input[name="roundId"]')).toHaveValue(third.id);
  await form.locator(`button[value="${wrong}"]`).click();
  await expect(
    page.getByRole("heading", { name: "Run complete", exact: true }),
  ).toBeFocused();
  await expect(form).toHaveCount(0);
  await expect(page.getByLabel("Run score")).toContainText("2");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Play run")).toContainText("2 points · ended");
  expect(
    runSql(
      `select total_votes||','||current_streak from profiles where user_id='${uid}'`,
    ),
  ).toBe("0,0");
  await page
    .getByRole("link", { name: "Play higher rated", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start a new run", exact: true })
    .click();
  await expect(page.getByLabel("Run score")).toContainText("0");
  expect(latest(uid).run_id).not.toBe(r.run_id);
  expect(core()).toBe(before);
});

test("Play: expiry/unavailability preserves points; server-action retries and other accounts cannot forge a score", async ({
  page,
  request,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(150000);
  const email = `play-boundaries-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  seedRankEvidence(uid);
  await page.goto("/play");
  await page.getByRole("button", { name: "Start a run", exact: true }).click();
  const form = page.locator("form.matchup");
  await expect(form.locator('button[name="selectedSongId"]')).toHaveCount(2);
  await dismissPlayTutorial(page);
  let r = latest(uid);
  const captured = page.waitForRequest(
    (req) => req.method() === "POST" && new URL(req.url()).pathname === "/play",
  );
  // Browser score fields and an external redirect destination have no authority.
  await form.evaluate((node) => {
    const input = document.createElement("input");
    input.name = "score";
    input.value = "999";
    node.append(input);
    node.querySelector<HTMLInputElement>('[name="returnTo"]')!.value =
      "https://example.invalid/";
  });
  await form.locator(`button[value="${higher(r)}"]`).click();
  const post = await captured;
  await expect(page.getByLabel("Run score")).toContainText("1");
  const headers = {
    Origin: baseURL!,
    "Next-Action": post.headers()["next-action"],
    "Content-Type": post.headers()["content-type"],
  };
  const duplicate = await page.request.post("/play", {
    headers,
    data: post.postDataBuffer()!,
  });
  expect(duplicate.headers()["x-action-redirect"]).toContain(r.id);
  expect(duplicate.headers()["x-action-redirect"]).toMatch(/^\/play\?/);
  expect(runSql(`select score from play_runs where id='${r.run_id}'`)).toBe(
    "1",
  );
  const anonymous = await request.post("/play", {
    headers,
    data: post.postDataBuffer()!,
  });
  expect(anonymous.headers()["x-action-redirect"]).toMatch(
    /Sign\+in\+to\+play/,
  );
  const other = await browser.newContext({ baseURL });
  try {
    const stranger = await other.newPage();
    await stranger.addInitScript(() =>
      sessionStorage.setItem("musicale-entry-session-v1", "yes"),
    );
    await signIn(
      stranger,
      request,
      `play-stranger-${Date.now()}-${info.project.name}@example.test`,
    );
    const denied = await stranger.request.post("/play", {
      headers,
      data: post.postDataBuffer()!,
    });
    expect(decodeURIComponent(denied.headers()["x-action-redirect"])).toContain(
      "Round unavailable",
    );
    await stranger.goto(`/play?answered=${r.id}`);
    await expect(stranger.getByLabel("Saved answer")).toHaveCount(0);
  } finally {
    await other.close();
  }
  r = latest(uid);
  runSql(
    `update play_rounds set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where id='${r.id}'`,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Run paused", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Run score")).toContainText("1");
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: "Resume run", exact: true }).click();
  await expect(form.locator('button[name="selectedSongId"]')).toHaveCount(2);
  const fresh = latest(uid);
  expect(fresh.id).not.toBe(r.id);
  expect([fresh.song_a_id, fresh.song_b_id]).toEqual([
    r.song_a_id,
    r.song_b_id,
  ]);
  const originalStatus = runSql(
    `select status from songs where id='${fresh.song_a_id}'`,
  );
  try {
    runSql(
      `update songs set status='unavailable' where id='${fresh.song_a_id}'`,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Run paused", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("A song is temporarily unavailable.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Run score")).toContainText("1");
    await expect(form).toHaveCount(0);
    await page.screenshot({
      path: `output/${info.project.name}-play-paused.png`,
      fullPage: true,
    });
  } finally {
    runSql(
      `update songs set status='${originalStatus}' where id='${fresh.song_a_id}'`,
    );
  }
  await page.getByRole("button", { name: "Resume run", exact: true }).click();
  await expect(form.locator('input[name="roundId"]')).toHaveValue(fresh.id);
  await expect(page.getByLabel("Run score")).toContainText("1");
});
