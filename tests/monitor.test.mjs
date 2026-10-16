import test from "node:test";
import assert from "node:assert/strict";
import { monitor } from "../scripts/monitor.mjs";

const ready = {
  status: "ready",
  utc_day: "2026-10-16",
  today_playable: true,
  buffer_days: 30,
  scheduled_days: 30,
};
async function run(
  product = ready,
  { health = 200, outage = false, mail = 200 } = {},
) {
  const alerts = [];
  const result = await monitor({
    siteUrl: "https://musicale.example",
    apiKey: "test-only",
    to: "owner@example.test",
    fetcher: async (url, options) => {
      if (url === "https://api.resend.com/emails") {
        alerts.push(JSON.parse(options.body));
        return Response.json({ id: "test-delivery" }, { status: mail });
      }
      if (outage) throw new Error("Simulated connectivity failure");
      return url.endsWith("/health")
        ? Response.json(
            { status: health === 200 ? "ready" : "unavailable" },
            { status: health },
          )
        : Response.json(product, {
            status: product.status === "ready" ? 200 : 503,
          });
    },
  });
  return { result, alerts };
}
test("healthy database and daily product send no alert", async () => {
  assert.deepEqual(await run(), {
    result: { ready: true, alerted: false },
    alerts: [],
  });
});
test("a missing day sends actionable aggregate-only feedback", async () => {
  const { result, alerts } = await run({
    ...ready,
    status: "attention",
    today_playable: false,
  });
  assert.equal(result.alerted, true);
  assert.match(alerts[0].text, /Today playable: no/);
  assert.match(alerts[0].text, /\/admin/);
  assert.equal(alerts[0].to[0], "owner@example.test");
  assert.ok(!alerts[0].text.includes("song_a"));
});
test("thirteen future days alert and fourteen pass", async () => {
  assert.equal(
    (await run({ ...ready, status: "attention", buffer_days: 13 })).result
      .alerted,
    true,
  );
  assert.equal((await run({ ...ready, buffer_days: 14 })).alerts.length, 0);
});
test("database outage and disconnected endpoint alert", async () => {
  assert.equal((await run(ready, { health: 503 })).result.alerted, true);
  assert.equal((await run(ready, { outage: true })).result.alerted, true);
});
test("malformed readiness never passes", async () => {
  assert.equal((await run({ status: "ready" })).result.alerted, true);
  assert.equal(
    (await run({ ...ready, scheduled_days: 1 })).result.alerted,
    true,
  );
});
test("a failed mail request is not reported as delivered", async () => {
  await assert.rejects(
    run({ ...ready, status: "attention" }, { mail: 500 }),
    /not accepted/,
  );
});
test("credentials cannot be sent to a custom monitor URL", async () => {
  await assert.rejects(
    monitor({
      siteUrl: "https://secret@example.test",
      apiKey: "test",
      to: "owner@example.test",
    }),
    /HTTPS origin/,
  );
  await assert.rejects(
    monitor({
      siteUrl: "http://example.test",
      apiKey: "test",
      to: "owner@example.test",
    }),
    /HTTPS origin/,
  );
});
