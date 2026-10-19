import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  databaseHarness,
  migrations,
  asUser,
  user,
} from "./database-harness.mjs";
const db = databaseHarness("metadata");
const literal = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
try {
  await db.create();
  await db.migrate();
  await db.sql(readFileSync("supabase/seed.sql", "utf8"));
  await db.sql(
    `insert into auth.users values('${user(1)}','admin@example.test'),('${user(2)}','user@example.test');update profiles set role='admin' where user_id='${user(1)}'`,
  );
  const core = () =>
    db.sql(
      `select jsonb_build_object('songs',(select jsonb_agg(jsonb_build_array(id,elo_rating,wins,losses,matchup_count) order by id) from songs),'providers',(select jsonb_agg(to_jsonb(p) order by id) from song_providers p),'votes',(select jsonb_agg(to_jsonb(v)) from votes v),'days',(select jsonb_agg(to_jsonb(d) order by id) from daily_matchups d))`,
    );
  const before = await core();
  await assert.rejects(
    db.sql(asUser(2, "select claim_song_metadata()")),
    /Admin/,
  );
  const job = JSON.parse(
    await db.sql(asUser(1, "select claim_song_metadata('respect-aretha')")),
  );
  assert.equal(
    await db.sql(asUser(1, "select claim_song_metadata('respect-aretha')")),
    "",
  );
  const selected = {
    recordingId: "11111111-1111-4111-8111-111111111111",
    releaseId: "22222222-2222-4222-8222-222222222222",
    releaseGroupId: "33333333-3333-4333-8333-333333333333",
    albumName: "Wrong album must not overwrite editorial value",
    originalDate: "1967-04-29",
    albumDate: "1967-03",
    durationMs: 145000,
    confidence: 0.97,
    artwork: {
      url: "https://coverartarchive.org/release/22222222-2222-4222-8222-222222222222/123-500.jpg",
      imageId: "123",
      releaseId: "22222222-2222-4222-8222-222222222222",
      sourceUrl:
        "https://musicbrainz.org/release/22222222-2222-4222-8222-222222222222",
      status: "permission_required",
    },
  };
  await db.sql(`update songs set duration_ms=160000 where id='respect-aretha'`);
  const finish = `select finish_song_metadata('respect-aretha','${job.lease}','enriched',${literal([selected])},${literal(selected)},null)`;
  await db.sql(asUser(1, finish));
  const result = JSON.parse(
    await db.sql("select to_jsonb(s) from songs s where id='respect-aretha'"),
  );
  assert.equal(result.album_name, "I Never Loved a Man the Way I Love You");
  assert.equal(result.duration_ms, 160000);
  assert.equal(result.artwork_url, null);
  assert.equal(result.release_date, "1967-04-29");
  await assert.rejects(db.sql(asUser(1, finish)), /lease/);
  await assert.rejects(
    db.sql(
      asUser(
        2,
        "select review_metadata_artwork('respect-aretha','authorized','direct_permission','https://example.org/license','Explicit permission for this exact image on Musicale.','Artist')",
      ),
    ),
    /Admin/,
  );
  await db.sql(
    asUser(
      1,
      "select review_metadata_artwork('respect-aretha','authorized','direct_permission','https://example.org/license','Explicit permission for this exact image on Musicale.','Artist')",
    ),
  );
  assert.equal(
    await db.sql("select artwork_url from songs where id='respect-aretha'"),
    selected.artwork.url,
  );
  assert.equal(
    await db.sql(
      "select metadata_details ? 'artworkPermission' from songs where id='respect-aretha'",
    ),
    "f",
  );
  assert.equal(
    await db.sql(
      asUser(
        1,
        "select artwork_permission->>'evidence' from song_metadata_jobs where song_id='respect-aretha'",
      ),
    ),
    "https://example.org/license",
  );
  await assert.rejects(
    db.sql(
      asUser(
        1,
        "select review_metadata_artwork('respect-aretha','authorized','direct_permission','https://example.org/license','Explicit permission for this exact image on Musicale.','Artist')",
      ),
    ),
    /Existing artwork/,
  );
  assert.equal(await core(), before);
  await db.sql(
    asUser(1, "select review_metadata_artwork('respect-aretha','pending')"),
  );
  assert.equal(
    await db.sql(
      "select artwork_url is null from songs where id='respect-aretha'",
    ),
    "t",
  );
  await assert.rejects(
    db.sql(
      asUser(
        1,
        "select review_metadata_artwork('respect-aretha','authorized','open_license','https://musicbrainz.org/release/22222222-2222-4222-8222-222222222222','Attribution alone is not a grant of rights.','Artist')",
      ),
    ),
    /Document rights/,
  );
  await db.sql(
    "update songs set artwork_url='https://example.org/manual.jpg' where id='respect-aretha'",
  );
  await db.sql(
    asUser(1, "select review_metadata_artwork('respect-aretha','rejected')"),
  );
  assert.equal(
    await db.sql("select artwork_url from songs where id='respect-aretha'"),
    "https://example.org/manual.jpg",
  );
  await db.sql(asUser(1, "select retry_song_metadata('respect-aretha')"));
  const retained = JSON.parse(
    await db.sql(
      "set role service_role;select claim_song_metadata('respect-aretha');reset role;",
    ),
  );
  assert.deepEqual(retained.candidates, [selected]);
  await db.sql(
    "update song_metadata_jobs set lease_until=now()-interval '1 second' where song_id='respect-aretha'",
  );
  assert.ok(
    JSON.parse(
      await db.sql(asUser(1, "select claim_song_metadata('respect-aretha')")),
    ).lease,
  );
  await db.sql(
    "update songs set title='Respect (editor corrected)' where id='respect-aretha'",
  );
  assert.equal(
    await db.sql(
      "select status from song_metadata_jobs where song_id='respect-aretha'",
    ),
    "queued",
  );
  assert.equal(
    await db
      .sql("set role anon;select count(*) from song_metadata_jobs")
      .catch(() => "denied"),
    "denied",
  );
  console.log(
    "PASS metadata queue, leases, authorization, manual edits, retry and rating/provider/vote preservation",
  );
} finally {
  db.close();
}
