import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
// @ts-expect-error Node-only local test helper.
import { localSettings, localContainer } from "./local-env.mjs";
const localBackend = localSettings(); // Refuse tests against a hosted project.
const mailUrl = localBackend.MAILPIT_URL ?? localBackend.INBUCKET_URL;
export const runSql = (text: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      localContainer(),
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: text, encoding: "utf8", timeout: 15000 },
  ).trim();

export async function requestSignInLink(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(
    page.getByText("Magic link sent. Check your inbox."),
  ).toBeVisible();
  let messageId = "";
  await expect
    .poll(async () => {
      const response = await request.get(`${mailUrl}/api/v1/messages`);
      const inbox = await response.json();
      const message = inbox.messages.find(
        (m: { To: { Address: string }[]; ID: string }) =>
          m.To.some((t) => t.Address === email),
      );
      messageId = message?.ID ?? "";
      return Boolean(messageId);
    })
    .toBe(true);
  const message = await (
    await request.get(`${mailUrl}/api/v1/message/${messageId}`)
  ).json();
  const href = String(message.HTML).match(
    /href="([^"]*(?:\/auth\/v1\/verify|\/api\/auth\/callback\?token_hash=)[^"]*)"/,
  )?.[1];
  expect(href, "Local sign-in email contains a verification link").toBeTruthy();
  return href!.replaceAll("&amp;", "&");
}
export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  const link = await requestSignInLink(page, request, email);
  await page.goto(link);
  if (new URL(link).searchParams.has("token_hash"))
    await page.getByRole("button", { name: "Confirm sign-in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  return link;
}

export async function dismissPlayTutorial(page: Page) {
  const dialog = page.getByRole("dialog", { name: "How to play" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Let’s play", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

export function seedRankEvidence(uid: string) {
  // Actual accepted preferences supply evidence, rather than faking counters or Elo.
  runSql(`update rank_comparisons set status='expired' where user_id='${uid}' and status='pending';begin;set local request.jwt.claim.sub='${uid}';
    do $$declare ids text[];c uuid;r jsonb;begin select array_agg(id order by id) into ids from (select id from songs where status='active' order by id limit 6) s;
    for i in 1..3 loop insert into rank_comparisons(user_id,song_a_id,song_b_id) values('${uid}',ids[2*i-1],ids[2*i]) returning id into c;
    r:=submit_rank_vote(c,ids[2*i-1]);if r ? 'error' then raise exception 'Play evidence fixture failed';end if;
    update rank_comparisons set status='expired' where user_id='${uid}' and status='pending';end loop;end$$;commit`);
}
