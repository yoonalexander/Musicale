import { pathToFileURL } from "node:url";

export async function monitor({ siteUrl, apiKey, to, fetcher = fetch }) {
  const url = new URL(siteUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Monitor URL must be an HTTPS origin.");
  if (!apiKey || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    throw new Error("Configure RESEND_API_KEY and MUSICALE_ALERT_EMAIL.");
  let detail =
    "The database or product-readiness endpoint could not be verified.";
  let healthy = false;
  try {
    const [health, readiness] = await Promise.all([
      fetcher(url.origin + "/api/health", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        redirect: "error",
      }),
      fetcher(url.origin + "/api/readiness", {
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        redirect: "error",
      }),
    ]);
    const [database, product] = await Promise.all([
      health.json(),
      readiness.json(),
    ]);
    const valid =
      typeof product.today_playable === "boolean" &&
      Number.isInteger(product.buffer_days) &&
      product.buffer_days >= 0 &&
      product.buffer_days <= 30 &&
      Number.isInteger(product.scheduled_days) &&
      product.scheduled_days >= 0 &&
      product.scheduled_days <= 30 &&
      product.scheduled_days >= product.buffer_days &&
      /^\d{4}-\d{2}-\d{2}$/.test(product.utc_day);
    if (valid) {
      healthy =
        health.ok &&
        readiness.ok &&
        database.status === "ready" &&
        product.status === "ready" &&
        product.today_playable &&
        product.buffer_days >= 14;
      detail = `UTC day: ${product.utc_day}. Today playable: ${product.today_playable ? "yes" : "no"}. Consecutive future days: ${product.buffer_days}. Valid days in the next thirty: ${product.scheduled_days}. Database endpoint: ${health.ok && database.status === "ready" ? "ready" : "unavailable"}.`;
    }
  } catch {
    /* The same actionable alert covers connectivity and malformed responses. */
  }
  if (healthy) return { ready: true, alerted: false };
  const sent = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: "Musicale operations <signin@auth.musicale.alexyoon.com>",
      to: [to],
      subject: "[Musicale] Daily availability needs attention",
      text: `${detail}\n\nOpen ${url.origin}/admin to repair scheduling or availability. For a database or sign-in failure, follow docs/OPERATIONS.md in yoonalexander/musicale. Recheck both /api/health and /api/readiness after repair.`,
    }),
  });
  if (!sent.ok || !(await sent.json()).id)
    throw new Error("Alert delivery was not accepted.");
  return { ready: false, alerted: true };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await monitor({
      siteUrl: process.env.MUSICALE_MONITOR_URL,
      apiKey: process.env.RESEND_API_KEY,
      to: process.env.MUSICALE_ALERT_EMAIL,
    });
    console.log(
      result.ready
        ? "Musicale is ready."
        : "Musicale needs attention; the alert provider accepted delivery.",
    );
    if (!result.ready) process.exitCode = 1;
  } catch {
    console.error(
      "Musicale monitor failed. Check configuration and provider delivery logs; no delivery is confirmed.",
    );
    process.exitCode = 1;
  }
}
