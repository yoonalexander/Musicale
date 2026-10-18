import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { runSql } from "../browser-helpers";

test("database health stays ready when today has no playable pair; readiness exposes only operational aggregates", async ({
  request,
}) => {
  runSql(readFileSync("supabase/seed.sql", "utf8"));
  const id = runSql(
    "select song_a_id from daily_matchups where matchup_day=(now() at time zone 'UTC')::date",
  );
  const status = runSql("select status from songs where id='" + id + "'");
  try {
    runSql("update songs set status='unavailable' where id='" + id + "'");
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: "ready" });
    const response = await request.get("/api/readiness");
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.json();
    expect(body.status).toBe("attention");
    expect(body.today_playable).toBe(false);
    expect(Object.keys(body).sort()).toEqual([
      "buffer_days",
      "scheduled_days",
      "status",
      "today_playable",
      "utc_day",
    ]);
  } finally {
    runSql("update songs set status='" + status + "' where id='" + id + "'");
  }
  const response = await request.get("/api/readiness");
  const body = await response.json();
  expect(body.today_playable).toBe(true);
  expect(response.status()).toBe(body.buffer_days >= 14 ? 200 : 503);
});
