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
    { input: text, encoding: "utf8" },
  ).trim();

export async function signIn(
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
    /href="([^"]*\/auth\/v1\/verify[^"]*)"/,
  )?.[1];
  expect(href, "Local sign-in email contains a verification link").toBeTruthy();
  await page.goto(href!.replaceAll("&amp;", "&"));
  await expect(page).toHaveURL(/\/today$/);
  return href!.replaceAll("&amp;", "&");
}
