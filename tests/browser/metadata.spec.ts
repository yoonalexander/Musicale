import { test, expect } from "./fixtures";
import { runSql, signIn } from "../browser-helpers";
import { readFileSync } from "node:fs";
import { rankMetadata } from "../../lib/metadata-enrichment";

const json = (value: string) => "'" + value.replaceAll("'", "''") + "'::jsonb";
test("song pages omit artwork and admin has no artwork workflow", async ({
  page,
  request,
}, info) => {
  const old = JSON.parse(
    runSql("select to_jsonb(s) from songs s where id='respect-aretha'"),
  );
  const email = `metadata-${info.project.name}-${Date.now()}@example.test`;
  let artworkRequests = 0;
  await page.route("https://images.example.test/**", (route) => {
    artworkRequests++;
    return route.abort();
  });
  try {
    runSql(
      "update songs set artwork_url='https://images.example.test/unused.jpg' where id='respect-aretha'",
    );
    await signIn(page, request, email);
    for (const path of [
      "/songs/respect-aretha",
      "/leaderboard",
      "/rank",
      "/play",
      "/today",
    ]) {
      await page.goto(path);
      await expect(
        page.locator(".art, .detail-art, img[alt$='album artwork']"),
      ).toHaveCount(0);
      if (path === "/rank")
        await page.screenshot({
          path: `output/artwork-removed-rank-${info.project.name}.png`,
        });
    }
    expect(artworkRequests).toBe(0);
    runSql(
      `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
    );
    await page.goto("/admin");
    await expect(page.getByLabel("Artwork HTTPS URL (optional)")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("option", { name: "Covers awaiting permission" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Artwork permission" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Album metadata", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `output/artwork-removed-admin-${info.project.name}.png`,
      fullPage: true,
    });
  } finally {
    runSql(
      `update songs set artwork_url=${old.artwork_url ? "'" + old.artwork_url.replaceAll("'", "''") + "'" : "null"} where id='respect-aretha'`,
    );
  }
});

test("reviewed metadata and year save without requesting artwork", async ({
  page,
  request,
}, info) => {
  const original = runSql(
      "select to_jsonb(s) from songs s where id='respect-aretha'",
    ),
    oldJob = runSql(
      "select to_jsonb(j) from song_metadata_jobs j where song_id='respect-aretha'",
    );
  const candidate = rankMetadata(
    {
      id: "respect-aretha",
      title: "Respect",
      artist_name: "Aretha Franklin",
      album_name: "I Never Loved a Man the Way I Love You",
      release_year: 1967,
    },
    JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8")),
  )[0];
  const email = `metadata-review-${info.project.name}-${Date.now()}@example.test`;
  try {
    runSql(
      `update songs set metadata_details=null,release_year=1968 where id='respect-aretha';update song_metadata_jobs set status='review',candidates=${json(JSON.stringify([candidate]))},lease=null,lease_until=null where song_id='respect-aretha'`,
    );
    await signIn(page, request, email);
    runSql(
      `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
    );
    await page.goto("/admin");
    const panel = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: "Album metadata", exact: true }),
    });
    await panel.getByLabel("Find a song or artist").fill("Respect");
    await panel.getByText("Respect · review", { exact: false }).click();
    await panel.getByRole("radio").check();
    await panel
      .getByLabel(
        "I verified the song, credited artists, version and release edition.",
      )
      .check();
    await panel
      .getByLabel(
        "Replace the current original year/date with this reviewed year/date.",
      )
      .check();
    await panel
      .getByRole("button", { name: "Save reviewed association", exact: true })
      .click();
    await expect(panel.getByRole("status")).toHaveText("Metadata work saved.");
    expect(
      runSql(
        "select metadata_details->>'reviewedByAdmin' from songs where id='respect-aretha'",
      ),
    ).toBe("true");
    expect(
      runSql("select release_year from songs where id='respect-aretha'"),
    ).toBe("1967");
    expect(
      runSql(
        "select status from song_metadata_jobs where song_id='respect-aretha'",
      ),
    ).toBe("enriched");
  } finally {
    runSql(
      `update songs set (album_name,release_year,release_date,duration_ms,artwork_url,artwork_source_url,artwork_attribution,metadata_details)=(select r.album_name,r.release_year,r.release_date,r.duration_ms,r.artwork_url,r.artwork_source_url,r.artwork_attribution,r.metadata_details from jsonb_populate_record(null::songs,${json(original)}) r) where id='respect-aretha';update song_metadata_jobs set (status,attempts,next_attempt_at,lease,lease_until,snapshot,candidates,error,artwork_permission)=(select r.status,r.attempts,r.next_attempt_at,r.lease,r.lease_until,r.snapshot,r.candidates,r.error,r.artwork_permission from jsonb_populate_record(null::song_metadata_jobs,${json(oldJob)}) r) where song_id='respect-aretha'`,
    );
  }
});
