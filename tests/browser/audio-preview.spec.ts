import { test, expect } from "./fixtures";
import { runSql, signIn } from "../browser-helpers";

test("retired open-license songs and their import controls stay off the website", async ({
  page,
  request,
}, info) => {
  expect(
    runSql(
      "select count(*) from songs where artist_name='Kevin MacLeod' and status='active'",
    ),
  ).toBe("0");
  await page.goto("/leaderboard?artist=Kevin%20MacLeod");
  await expect(page.locator(".leader-row")).toHaveCount(0);
  for (const id of [
    "open-gymnopedie-1",
    "open-gymnopedie-2",
    "open-gymnopedie-3",
    "open-mountain-king",
  ]) {
    expect((await request.get(`/songs/${id}`)).status()).toBe(404);
  }
  const email = `retired-audio-${Date.now()}-${info.project.name}@example.test`;
  await signIn(page, request, email);
  runSql(
    `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("button", { name: "Import four open-license recordings" }),
  ).toHaveCount(0);
  await page.goto("/rank");
  await expect(page.locator("form.matchup")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "15-second previews only" }),
  ).toHaveCount(0);
  await expect(page.locator("form.matchup")).not.toContainText("Kevin MacLeod");
});
