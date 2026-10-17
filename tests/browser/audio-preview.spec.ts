import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { runSql, signIn, dismissPlayTutorial } from "../browser-helpers";

async function setup(page: Page, request: APIRequestContext, project: string) {
  const email = `audio-${Date.now()}-${project}@example.test`;
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  runSql(`update profiles set role='admin' where user_id='${uid}'`);
  await page.goto("/admin");
  const editor = page.locator("section.panel").filter({
    has: page.getByRole("heading", {
      name: "Audio availability and authorization",
      exact: true,
    }),
  });
  await editor
    .getByRole("button", {
      name: "Import four open-license recordings",
      exact: true,
    })
    .click();
  await expect(editor.getByRole("status")).toContainText(
    "4 authorized previews connected",
    { timeout: 15000 },
  );
  runSql("update songs set status='active' where id like 'open-%'");
  return uid;
}
const cleanup = () =>
  runSql("update songs set status='disabled' where id like 'open-%'");
async function rank(page: Page) {
  await page.goto("/rank");
  await page
    .getByRole("button", { name: "Listen and rank", exact: true })
    .click();
  await expect(page.locator(".audio-preview")).toHaveCount(2);
}

test("real licensed music: custom controls, pause, exclusive playback, seeking, 15-second gate, replay, buffering and mobile accessibility", async ({
  page,
  context,
  request,
}, info) => {
  test.setTimeout(150000);
  // Observe real decoded music and the actual output gain, without changing the product's audio path.
  await context.addInitScript(() => {
    const original = AudioContext.prototype.createGain;
    (window as any).__audioProbes = [];
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this),
        analyser = this.createAnalyser(),
        muted = original.call(this);
      muted.gain.value = 0;
      gain.connect(analyser);
      analyser.connect(muted);
      muted.connect(this.destination);
      (window as any).__audioProbes.push({ gain, analyser, context: this });
      return gain;
    };
  });
  try {
    await setup(page, request, info.project.name);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await rank(page);
    const players = page.locator(".audio-preview"),
      a = players.nth(0),
      b = players.nth(1);
    const audio = a.locator("audio"),
      audioB = b.locator("audio");
    expect(await audio.evaluate((el: HTMLAudioElement) => el.readyState)).toBe(
      0,
    );
    await a.getByRole("button").click();
    await expect(a).toHaveAttribute("data-state", "playing");
    await expect
      .poll(() =>
        page.evaluate(() => {
          return (window as any).__audioProbes.some((p: any) => {
            const samples = new Float32Array(p.analyser.fftSize);
            p.analyser.getFloatTimeDomainData(samples);
            return samples.some((v) => Math.abs(v) > 0.0001);
          });
        }),
      )
      .toBe(true);
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0.6);
    await a.getByRole("button").click();
    const paused = await audio.evaluate(
      (el: HTMLAudioElement) => el.currentTime,
    );
    await page.waitForTimeout(300);
    expect(
      Math.abs(
        (await audio.evaluate((el: HTMLAudioElement) => el.currentTime)) -
          paused,
      ),
    ).toBeLessThan(0.1);
    await b.getByRole("button").click();
    await expect(b).toHaveAttribute("data-state", "playing");
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(
      true,
    );
    await a.getByRole("button").click();
    await expect(a).toHaveAttribute("data-state", "playing");
    expect(await audioB.evaluate((el: HTMLAudioElement) => el.paused)).toBe(
      true,
    );
    // Buffering time consumes no playback budget and the audio gate is closed until playback resumes.
    await audio.evaluate((el: HTMLAudioElement) =>
      el.dispatchEvent(new Event("waiting")),
    );
    await expect(a).toHaveAttribute("data-state", "buffering");
    expect(
      await page.evaluate(
        () => (window as any).__audioProbes[0].gain.gain.value,
      ),
    ).toBe(0);
    await audio.evaluate((el: HTMLAudioElement) =>
      el.dispatchEvent(new Event("playing")),
    );
    await expect(a).toHaveAttribute("data-state", "playing");
    await a.getByRole("slider").focus();
    await page.keyboard.press("End");
    await expect(a).toHaveAttribute("data-state", "finished");
    expect(
      await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
    ).toBeLessThanOrEqual(15.1);
    await a.getByRole("button", { name: /Replay preview/ }).click();
    await expect(a).toHaveAttribute("data-state", "playing");
    const started = Date.now();
    await expect(a).toHaveAttribute("data-state", "finished", {
      timeout: 18000,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThan(14000);
    expect(elapsed).toBeLessThan(16000);
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(
      true,
    );
    expect(
      await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
    ).toBeLessThanOrEqual(15.15);
    expect(
      await page.evaluate(
        () => (window as any).__audioProbes[0].gain.gain.value,
      ),
    ).toBe(0);
    await a.getByRole("button", { name: /Replay preview/ }).click();
    await expect(a).toHaveAttribute("data-state", "playing");
    // Seeking backward cannot renew the per-replay playback budget.
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(1);
    await audio.evaluate((el: HTMLAudioElement) => {
      el.currentTime = 0;
    });
    await expect(a).toHaveAttribute("data-state", "finished", {
      timeout: 16000,
    });
    expect(
      await audio.evaluate((el: HTMLAudioElement) => el.currentTime),
    ).toBeLessThan(14.5);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize(
      info.project.use.viewport ?? { width: 1280, height: 720 },
    );
    await page.screenshot({
      path: `output/${info.project.name}-audio-player.png`,
      fullPage: true,
    });
  } finally {
    cleanup();
  }
});

test("licensed catalog import, Rank votes, Play and song-page integration, cleanup, unavailable audio and retry", async ({
  page,
  request,
}, info) => {
  test.setTimeout(150000);
  const statuses = runSql(
    "select jsonb_object_agg(id,status) from songs where id not like 'open-%'",
  );
  try {
    const uid = await setup(page, request, info.project.name);
    await rank(page);
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(".audio-preview")).toHaveCount(2);
      await page.locator(".audio-preview").first().getByRole("button").click();
      await expect(page.locator(".audio-preview").first()).toHaveAttribute(
        "data-state",
        "playing",
      );
      await page.evaluate(() => {
        (window as any).__oldAudio = document.querySelector("audio");
      });
      const comparison = await page
        .locator('input[name="comparisonId"]')
        .inputValue();
      await page
        .locator("form.matchup button[name=selectedSongId]")
        .first()
        .click();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Your preference is saved." }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`saved=${comparison}`));
      await expect
        .poll(() => page.evaluate(() => (window as any).__oldAudio.paused))
        .toBe(true);
    }
    expect(
      runSql(`select count(*) from rank_votes where user_id='${uid}'`),
    ).toBe("2");
    runSql("update songs set status='disabled' where id not like 'open-%'");
    await page.goto("/play");
    await page
      .getByRole("button", { name: "Start a run", exact: true })
      .click();
    await dismissPlayTutorial(page);
    await expect(page.locator(".audio-preview")).toHaveCount(2);
    await page.locator(".audio-preview").first().getByRole("button").click();
    await expect(page.locator(".audio-preview").first()).toHaveAttribute(
      "data-state",
      "playing",
    );
    const round = JSON.parse(
      runSql(
        `select row_to_json(c) from play_rounds c join play_runs r on r.id=c.run_id where r.user_id='${uid}' and c.status='pending'`,
      ),
    );
    const selected =
      Number(round.rating_a) > Number(round.rating_b)
        ? round.song_a_id
        : round.song_b_id;
    await page
      .locator(`button[name=selectedSongId][value="${selected}"]`)
      .click();
    await expect(page.getByLabel("Run score")).toContainText("1");
    await page.goto("/songs/open-gymnopedie-1");
    const player = page.locator(".audio-preview");
    await page.route("**/audio/64738758.mp3", (r) => r.abort());
    await player.getByRole("button").click();
    await expect(player).toHaveAttribute("data-state", "error");
    await page.unroute("**/audio/64738758.mp3");
    await player.getByRole("button", { name: /Retry preview/ }).click();
    await expect(player).toHaveAttribute("data-state", "playing");
    runSql(
      "update song_audio_sources set availability='unavailable' where song_id='open-gymnopedie-1'",
    );
    await page.reload();
    await expect(page.locator(".audio-preview")).toHaveCount(0);
    await expect(
      page.getByText("Playback unavailable", { exact: true }),
    ).toBeVisible();
  } finally {
    runSql(
      `update songs s set status=e.value::song_status from jsonb_each_text('${statuses.replaceAll("'", "''")}'::jsonb) e where s.id=e.key;update song_audio_sources set availability='available' where song_id like 'open-%'`,
    );
    cleanup();
  }
});
