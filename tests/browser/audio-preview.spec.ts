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
    .getByRole("button", { name: "15-second previews only", exact: true })
    .click();
  await expect(page.locator(".audio-preview")).toHaveCount(2);
}

import type { BrowserContext } from "@playwright/test";
async function observeAudio(context: BrowserContext) {
  await context.addInitScript(() => {
    (window as any).__audioProbes = [];
    if (typeof AudioContext === "undefined") return;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = create.call(this),
        analyser = this.createAnalyser(),
        muted = this.createGain();
      muted.gain.value = 0;
      node.connect(analyser);
      analyser.connect(muted);
      muted.connect(this.destination);
      const probe: any = { node, analyser, context: this, ended: false };
      const start = node.start.bind(node);
      node.start = (when = 0, offset = 0, duration?: number) => {
        probe.offset = offset;
        probe.duration = duration;
        return start(when, offset, duration);
      };
      node.addEventListener("ended", () => {
        probe.ended = true;
      });
      (window as any).__audioProbes.push(probe);
      return node;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
      return decode.call(this, bytes).then((buffer) => {
        if ((window as any).__shortPreview) {
          const short = this.createBuffer(
            buffer.numberOfChannels,
            buffer.sampleRate * 3,
            buffer.sampleRate,
          );
          for (let channel = 0; channel < buffer.numberOfChannels; channel++)
            short.copyToChannel(
              buffer.getChannelData(channel).subarray(0, short.length),
              channel,
            );
          buffer = short;
        }
        return (window as any).__holdDecode
          ? new Promise<AudioBuffer>((resolve) => {
              (window as any).__releaseDecode = () => resolve(buffer);
            })
          : buffer;
      });
    };
  });
}

test("real licensed music: custom controls, pause, exclusive playback, seeking, 15-second gate, replay, buffering and mobile accessibility", async ({
  page,
  context,
  request,
}, info) => {
  test.setTimeout(150000);
  await observeAudio(context);
  let releaseNetwork!: () => void;
  const networkGate = new Promise<void>((resolve) => {
    releaseNetwork = resolve;
  });
  try {
    await setup(page, request, info.project.name);
    await context.clearCookies();
    await rank(page);
    const a = page.locator(".audio-preview").nth(0),
      b = page.locator(".audio-preview").nth(1);
    const cursor = () => a.getByRole("slider").inputValue().then(Number);
    const audible = () =>
      page.evaluate(() =>
        (window as any).__audioProbes.some((p: any) => {
          if (p.ended || p.context.state !== "running") return false;
          const samples = new Float32Array(p.analyser.fftSize);
          p.analyser.getFloatTimeDomainData(samples);
          return samples.some((v) => Math.abs(v) > 0.0001);
        }),
      );
    await page.route("**/audio/*.mp3", async (route) => {
      await networkGate;
      await route.continue();
    });
    await page.evaluate(() => {
      (window as any).__holdDecode = true;
    });
    await a.getByRole("button").click();
    if (await page.evaluate(() => typeof AudioContext === "undefined")) {
      await expect(a).toHaveAttribute("data-state", "error");
      await expect(a.getByRole("status")).toHaveText("Preview unavailable");
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      return;
    }
    await expect(a).toHaveAttribute("data-state", "loading");
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => (window as any).__audioProbes.length),
    ).toBe(0);
    releaseNetwork();
    await expect(a).toHaveAttribute("data-state", "buffering");
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => (window as any).__audioProbes.length),
    ).toBe(0);
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).__releaseDecode))
      .toBe("function");
    await a.getByRole("button").click();
    await expect(a).toHaveAttribute("data-state", "paused");
    await page.evaluate(() => {
      (window as any).__holdDecode = false;
      (window as any).__releaseDecode();
    });
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => (window as any).__audioProbes.length),
    ).toBe(0);
    await a.getByRole("button").click();
    await page.unroute("**/audio/*.mp3");
    await expect(a).toHaveAttribute("data-state", "playing");
    await expect.poll(audible).toBe(true);
    await expect.poll(cursor).toBeGreaterThan(0.6);
    await a.getByRole("button").click();
    const paused = await cursor();
    await page.waitForTimeout(300);
    expect(Math.abs((await cursor()) - paused)).toBeLessThan(0.1);
    await expect.poll(audible).toBe(false);
    await b.getByRole("button").click();
    await expect(b).toHaveAttribute("data-state", "playing");
    await expect(a).toHaveAttribute("data-state", "paused");
    await a.getByRole("button").click();
    await expect(a).toHaveAttribute("data-state", "playing");
    await expect(b).toHaveAttribute("data-state", "paused");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__audioProbes.filter((p: any) => !p.ended).length,
        ),
      )
      .toBe(1);
    await a.getByRole("slider").press("End");
    await expect(a).toHaveAttribute("data-state", "finished");
    expect(await cursor()).toBeLessThanOrEqual(15);
    await a.getByRole("button", { name: /Replay preview/ }).click();
    await expect(a).toHaveAttribute("data-state", "playing");
    await expect.poll(audible).toBe(true);
    const started = Date.now();
    await expect(a).toHaveAttribute("data-state", "finished", {
      timeout: 18000,
    });
    expect(Date.now() - started).toBeGreaterThan(14000);
    expect(Date.now() - started).toBeLessThan(16000);
    await expect.poll(audible).toBe(false);
    expect(await cursor()).toBeLessThanOrEqual(15);
    await a.getByRole("button", { name: /Replay preview/ }).click();
    await expect(a).toHaveAttribute("data-state", "playing");
    await expect.poll(cursor).toBeGreaterThan(1);
    await a.getByRole("slider").press("Home");
    await expect(a).toHaveAttribute("data-state", "playing");
    expect(await cursor()).toBeLessThan(0.5);
    await expect.poll(audible).toBe(true);
    expect(
      await page.evaluate(() => (window as any).__audioProbes.at(-1).offset),
    ).toBe(0);
    expect(
      await page.evaluate(() => (window as any).__audioProbes.at(-1).duration),
    ).toBeLessThan(14.5);
    await expect(a).toHaveAttribute("data-state", "finished", {
      timeout: 16000,
    });
    expect(await cursor()).toBeLessThan(14.5);
    await expect.poll(audible).toBe(false);
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
    releaseNetwork();
    cleanup();
  }
});

test("licensed catalog import, Rank votes, Play and song-page integration, cleanup, unavailable audio and retry", async ({
  page,
  request,
  context,
}, info) => {
  test.setTimeout(150000);
  await observeAudio(context);
  const statuses = runSql(
    "select jsonb_object_agg(id,status) from songs where id not like 'open-%'",
  );
  try {
    const uid = await setup(page, request, info.project.name);
    await rank(page);
    const expectedPlayback = await page.evaluate(() =>
      typeof AudioContext === "undefined" ? "error" : "playing",
    );
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(".audio-preview")).toHaveCount(2);
      await page.locator(".audio-preview").first().getByRole("button").click();
      await expect(page.locator(".audio-preview").first()).toHaveAttribute(
        "data-state",
        expectedPlayback,
      );
      await page.evaluate(() => {
        (window as any).__oldAudio = (window as any).__audioProbes.filter(
          (p: any) => !p.ended,
        );
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
        .poll(() =>
          page.evaluate(() =>
            (window as any).__oldAudio.every(
              (p: any) => p.ended || p.context.state === "closed",
            ),
          ),
        )
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
      expectedPlayback,
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
    if (expectedPlayback === "playing") {
      await page.evaluate(() => {
        (window as any).__shortPreview = true;
      });
      await player.getByRole("button").click();
      await expect(player).toHaveAttribute("data-state", "playing");
      await expect(player.getByRole("slider")).toHaveAttribute("max", "3");
      await expect(
        player.getByLabel("Remaining", { exact: true }),
      ).toContainText("0:03");
      await expect(player).toHaveAttribute("data-state", "finished", {
        timeout: 5000,
      });
      expect(Number(await player.getByRole("slider").inputValue())).toBeCloseTo(
        3,
        1,
      );
      await page.reload();
    }
    await page.route("**/audio/64738758.mp3", (r) => r.abort());
    await player.getByRole("button").click();
    await expect(player).toHaveAttribute("data-state", "error");
    await page.unroute("**/audio/64738758.mp3");
    await player.getByRole("button", { name: /Retry preview/ }).click();
    await expect(player).toHaveAttribute("data-state", expectedPlayback);
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
