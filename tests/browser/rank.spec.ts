import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { runSql, signIn } from "../browser-helpers";

test("Rank: repeated pairs, shared pending controls, live Elo, private paginated history and independent Daily", async ({
  page,
  request,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(150000);
  const email = `rank-browser-${Date.now()}-${info.project.name}@example.test`;
  await page.goto("/rank");
  await expect(
    page.getByRole("heading", { name: "Which song do you prefer?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Get a pair" })).toBeEnabled();
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  await page.getByRole("link", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL(/\/rank$/);
  expect(
    runSql(`select count(*) from rank_comparisons where user_id='${uid}'`),
  ).toBe("0");
  await page.getByRole("button", { name: "Get a pair", exact: true }).click();
  const form = page.locator("form.matchup"),
    buttons = form.locator('button[name="selectedSongId"]');
  await expect(buttons).toHaveCount(2);
  await expect(form.locator(".art, img[alt$='album artwork']")).toHaveCount(0);
  await page.screenshot({
    path: `output/artwork-removed-cards-${info.project.name}.png`,
  });
  await expect(form).not.toContainText(/Elo|1500|wins|losses/);
  const originalId = await form
    .locator('input[name="comparisonId"]')
    .inputValue();
  const originalSongs = await buttons.evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLButtonElement).value),
  );
  await page.reload();
  await expect(form.locator('input[name="comparisonId"]')).toHaveValue(
    originalId,
  );
  const picked = originalSongs[0],
    beforeCount = Number(
      runSql(`select matchup_count from songs where id='${picked}'`),
    );
  const watcher = await browser.newContext({
    baseURL,
    viewport: page.viewportSize(),
  });
  const board = await watcher.newPage();
  await board.addInitScript(() =>
    sessionStorage.setItem("musicale-entry-session-v1", "yes"),
  );
  try {
    await board.goto("/leaderboard");
    await expect(board.getByRole("status")).toContainText(
      "Live rankings connected",
      { timeout: 15000 },
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let intercepted!: () => void;
    const observed = new Promise<void>((resolve) => {
      intercepted = resolve;
    });
    await page.route("**/rank", async (route) => {
      if (route.request().method() === "POST") {
        intercepted();
        await held;
      }
      await route.continue();
    });
    const click = buttons.first().click();
    await observed;
    await expect(buttons.nth(0)).toBeDisabled();
    await expect(buttons.nth(1)).toBeDisabled();
    const began = Date.now();
    release();
    await click;
    await page.unroute("**/rank");
    await expect(page.getByRole("status")).toContainText(
      "Your preference is saved.",
    );
    await expect(
      board.locator(`.leader-row[href="/songs/${picked}"]`),
    ).toContainText(`${beforeCount + 1} votes`, { timeout: 5000 });
    console.log(`RANK LIVE ${info.project.name}: ${Date.now() - began}ms`);
    const nextSongs = await buttons.evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLButtonElement).value),
    );
    expect(nextSongs.every((id) => !originalSongs.includes(id))).toBe(true);
    expect(
      runSql(
        `select total_votes||','||current_streak from profiles where user_id='${uid}'`,
      ),
    ).toBe("0,0");
    expect(
      runSql(`select count(*) from user_daily_activity where user_id='${uid}'`),
    ).toBe("0");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/${info.project.name}-rank-pair.png`,
      fullPage: true,
    });
    await buttons.last().focus();
    const secondId = await form
      .locator('input[name="comparisonId"]')
      .inputValue();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        runSql(`select count(*) from rank_votes where user_id='${uid}'`),
      )
      .toBe("2");
    await expect(form.locator('input[name="comparisonId"]')).not.toHaveValue(
      secondId,
    );
    await page.goto("/today");
    await page
      .getByRole("button", { name: "Vote for Respect", exact: true })
      .click();
    await expect(page.locator(".result")).toBeVisible();
    expect(
      runSql(
        `select total_votes||','||current_streak from profiles where user_id='${uid}'`,
      ),
    ).toBe("1,1");
    await page.goto("/profile");
    await expect(
      page.getByText("2 continuous preferences.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("These patterns use Daily votes.", { exact: false }),
    ).toBeVisible();
    // Populate history through real transactional RPCs in this isolated backend, with a fresh request window for the fixture.
    runSql(`delete from request_budgets where user_id='${uid}' and action='rank';begin;set local role authenticated;set local request.jwt.claim.sub='${uid}';
      do $$declare c jsonb;r jsonb;begin perform start_rank_pair();for i in 1..26 loop c:=get_rank_state();r:=submit_rank_vote((c->>'id')::uuid,c->>'song_a_id');if r ? 'error' then raise exception 'History fixture failed';end if;end loop;end$$;commit`);
    await page.reload();
    const history = page.locator("section.panel").filter({
      has: page.getByRole("heading", {
        name: "Rank preferences",
        exact: true,
      }),
    });
    await expect(history.getByRole("listitem")).toHaveCount(25);
    await history
      .getByRole("link", { name: "Next Rank preferences", exact: true })
      .click();
    await expect(history.getByRole("listitem")).toHaveCount(3);
    await expect(history).toContainText("28 continuous preferences.");
    await page.goto("/profile?rankPage=10000");
    await expect(history).toContainText("No Rank preferences on this page.");
    await expect(history).toContainText("28 continuous preferences.");
    const payload = await (await board.request.get("/api/leaderboard")).text();
    expect(payload).not.toMatch(
      /user_id|email|comparison_id|selected_song_id|rank_votes|rank_comparisons/,
    );
  } finally {
    await watcher.close();
  }
});

test("Rank: expired and unavailable pairs recover honestly; another account cannot consume a pair", async ({
  page,
  request,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(90000);
  const email = `rank-boundaries-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  const uid = runSql(`select id from auth.users where email='${email}'`);
  await page.goto("/rank");
  await page.getByRole("button", { name: "Get a pair", exact: true }).click();
  const form = page.locator("form.matchup"),
    buttons = form.locator('button[name="selectedSongId"]');
  await expect(buttons).toHaveCount(2);
  const id = await form.locator('input[name="comparisonId"]').inputValue();
  runSql(
    `update rank_comparisons set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where id='${id}'`,
  );
  await buttons.first().click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Comparison expired",
  );
  expect(runSql(`select count(*) from rank_votes where user_id='${uid}'`)).toBe(
    "0",
  );
  await page.getByRole("button", { name: "Get a pair", exact: true }).click();
  await expect(form.locator('input[name="comparisonId"]')).not.toHaveValue(id);
  const captured = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/rank",
  );
  await buttons.first().click();
  const post = await captured;
  await expect(page.getByRole("status")).toContainText(
    "Your preference is saved.",
  );
  const headers = {
    Origin: baseURL!,
    "Next-Action": post.headers()["next-action"],
    "Content-Type": post.headers()["content-type"],
  };
  const anonymous = await request.post("/rank", {
    headers,
    data: post.postDataBuffer()!,
  });
  expect(anonymous.headers()["x-action-redirect"]).toMatch(
    /Sign\+in\+to\+rank/,
  );
  const other = await browser.newContext({ baseURL });
  const stranger = await other.newPage();
  await stranger.addInitScript(() =>
    sessionStorage.setItem("musicale-entry-session-v1", "yes"),
  );
  try {
    await signIn(
      stranger,
      request,
      `rank-stranger-${Date.now()}-${info.project.name}@example.test`,
    );
    const denied = await stranger.request.post("/rank", {
      headers,
      data: post.postDataBuffer()!,
    });
    expect(decodeURIComponent(denied.headers()["x-action-redirect"])).toContain(
      "Comparison unavailable",
    );
    await stranger.goto("/profile");
    await expect(
      stranger.getByText("0 continuous preferences.", { exact: false }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
  const status = runSql("select jsonb_object_agg(id,status) from songs");
  try {
    runSql("update songs set status='unavailable'");
    await page.goto("/rank");
    await expect(
      page.getByRole("button", { name: "Get a pair", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Get a pair", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "No fresh pair",
    );
    await expect(page.locator("form.matchup")).toHaveCount(0);
    expect(
      runSql(`select count(*) from rank_votes where user_id='${uid}'`),
    ).toBe("1");
  } finally {
    runSql(
      `update songs s set status=r.value::text::song_status from jsonb_each_text('${status}'::jsonb) r where id=r.key`,
    );
  }
});
