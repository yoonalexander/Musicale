import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { databaseHarness, createDay } from "./database-harness.mjs";
const db = databaseHarness("readiness");
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
const read = async (role = "anon") =>
  JSON.parse(await db.sql(`set role ${role};select get_product_readiness()`));
try {
  await db.create();
  await db.migrate();
  await check(
    "empty product has no playable day or buffer without leaking choices",
    async () => {
      const result = await read();
      assert.deepEqual(Object.keys(result).sort(), [
        "buffer_days",
        "scheduled_days",
        "today_playable",
        "utc_day",
      ]);
      assert.equal(result.today_playable, false);
      assert.equal(result.buffer_days, 0);
    },
  );
  await db.sql(readFileSync("supabase/seed.sql", "utf8"));
  await check("today alone is playable but has no future buffer", async () => {
    const r = await read();
    assert.equal(r.today_playable, true);
    assert.equal(r.buffer_days, 0);
    assert.equal(r.scheduled_days, 0);
  });
  for (let n = 1; n <= 30; n++) await db.sql(createDay(n));
  await check(
    "full valid thirty-day schedule is counted equally for anonymous and signed-in roles",
    async () => {
      const r = await read();
      assert.equal(r.buffer_days, 30);
      assert.equal(r.scheduled_days, 30);
      assert.deepEqual(r, await read("authenticated"));
    },
  );
  await check(
    "a gap ends the consecutive buffer even when later days exist",
    async () => {
      await db.sql(
        "update daily_matchups set status='cancelled' where matchup_day=(now() at time zone 'UTC')::date+5",
      );
      const r = await read();
      assert.equal(r.buffer_days, 4);
      assert.equal(r.scheduled_days, 29);
      await db.sql(
        "update daily_matchups set status='scheduled' where matchup_day=(now() at time zone 'UTC')::date+5",
      );
    },
  );
  await check(
    "unavailable song makes today and its future days unplayable",
    async () => {
      await db.sql(
        "update songs set status='unavailable' where id='respect-aretha'",
      );
      const r = await read();
      assert.equal(r.today_playable, false);
      assert.equal(r.buffer_days, 0);
      await db.sql(
        "update songs set status='active' where id='respect-aretha'",
      );
    },
  );
  await check(
    "metadata-only providers cannot count as playable content",
    async () => {
      await db.sql(
        "update song_providers set external_url=null where song_id='respect-aretha'",
      );
      const r = await read();
      assert.equal(r.today_playable, false);
      assert.equal(r.buffer_days, 0);
    },
  );
  await check(
    "readiness grants only aggregate function execution and preserves source-table protection",
    async () => {
      assert.equal(
        await db.sql(
          "select has_function_privilege('anon','get_product_readiness()','execute')",
        ),
        "t",
      );
      assert.equal(
        await db.sql(
          "select has_function_privilege('authenticated','get_product_readiness()','execute')",
        ),
        "t",
      );
      assert.equal(
        await db.sql("select has_schema_privilege('anon','public','create')"),
        "f",
      );
      assert.equal(
        await db.sql(
          "select prosecdef from pg_proc where oid='get_product_readiness()'::regprocedure",
        ),
        "t",
      );
      await assert.rejects(
        db.sql("set role anon;select * from votes"),
        /permission denied/,
      );
    },
  );
  console.log(`${passed} product-readiness database tests passed.`);
} finally {
  db.close();
}
