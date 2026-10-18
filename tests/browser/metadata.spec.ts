import { test, expect } from "./fixtures";
import { runSql, signIn } from "../browser-helpers";
import { readFileSync } from "node:fs";
import { rankMetadata } from "../../lib/metadata-enrichment";

test("broken covers fall back and metadata administration reports saved work", async ({
  page,
  request,
}, info) => {
  const old = runSql(
    "select to_jsonb(s) from songs s where id='respect-aretha'",
  );
  const original = JSON.parse(old);
  try {
    runSql(
      "update songs set artwork_url='https://images.example.test/missing.jpg' where id='respect-aretha'",
    );
    await page.route("https://images.example.test/**", (route) =>
      route.abort(),
    );
    await page.goto("/songs/respect-aretha");
    await expect(page.locator(".detail-art span")).toHaveText("R");
    await expect(page.locator(".detail-art img")).toHaveCount(0);
    const email = `metadata-${info.project.name}-${Date.now()}@example.test`;
    await signIn(page, request, email);
    runSql(
      `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
    );
    await page.goto("/admin");
    const panel = page.locator("section.panel").filter({
      has: page.getByRole("heading", { name: "Album metadata", exact: true }),
    });
    await expect(
      panel.getByRole("button", { name: "Enrich next 5 songs", exact: true }),
    ).toBeVisible();
    await panel.getByLabel("Review queue", { exact: true }).selectOption("all");
    await expect(
      panel.getByText("Respect · queued · 0 attempts", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Refresh progress", exact: true }),
    ).toBeEnabled();
  } finally {
    const quote = (v: string | null) =>
      v === null ? "null" : "'" + v.replaceAll("'", "''") + "'";
    runSql(
      `update songs set artwork_url=${quote(original.artwork_url)} where id='respect-aretha'`,
    );
  }
});
test("review a candidate without copying IDs and reject source-only artwork permission", async ({
  page,
  request,
}, info) => {
  const original = runSql(
      "select to_jsonb(s) from songs s where id='respect-aretha'",
    ),
    oldJob = runSql(
      "select to_jsonb(j) from song_metadata_jobs j where song_id='respect-aretha'",
    );
  const json = (value: string) =>
    "'" + value.replaceAll("'", "''") + "'::jsonb";
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
  try {
    runSql(
      `update songs set artwork_url=null,metadata_details=null where id='respect-aretha';update song_metadata_jobs set status='review',candidates=${json(JSON.stringify([candidate]))},lease=null,lease_until=null,artwork_permission=null where song_id='respect-aretha'`,
    );
    const email = `metadata-review-${info.project.name}-${Date.now()}@example.test`;
    await signIn(page, request, email);
    runSql(
      `update profiles set role='admin' where user_id=(select id from auth.users where email='${email}')`,
    );
    await page.goto("/admin");
    const panel = page
      .locator("section.panel")
      .filter({
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
      .getByRole("button", { name: "Save reviewed association", exact: true })
      .click();
    await expect(panel.getByRole("status")).toHaveText("Metadata work saved.");
    await panel
      .getByLabel("Review queue", { exact: true })
      .selectOption("enriched");
    await panel.getByText("Respect · enriched", { exact: false }).click();
    await panel.getByLabel("Rights basis").selectOption("open_license");
    await panel
      .getByLabel("Permission evidence URL", { exact: true })
      .fill(
        "https://musicbrainz.org/release/44444444-4444-4444-8444-444444444444",
      );
    await panel
      .getByLabel("What permits this exact image on Musicale?")
      .fill(
        "A source link and attribution are not evidence of an image license.",
      );
    await panel
      .getByLabel("Required attribution and license")
      .fill("Synthetic local fixture");
    await panel
      .getByLabel(
        "I verified this evidence permits the stated use; public availability and attribution are not my basis.",
      )
      .check();
    await panel
      .getByRole("button", { name: "Publish permitted cover", exact: true })
      .click();
    await expect(panel.getByRole("status")).toContainText(
      "Supply image-specific rights evidence",
    );
    expect(
      runSql("select artwork_url is null from songs where id='respect-aretha'"),
    ).toBe("t");
    await panel
      .getByRole("button", {
        name: "Reject or withdraw cover permission",
        exact: true,
      })
      .click();
    await expect(panel.getByRole("status")).toHaveText("Metadata work saved.");
    expect(
      runSql(
        "select artwork_permission->>'status' from song_metadata_jobs where song_id='respect-aretha'",
      ),
    ).toBe("rejected");
  } finally {
    runSql(
      `update songs set (album_name,release_year,release_date,duration_ms,artwork_url,artwork_source_url,artwork_attribution,metadata_details)=(select r.album_name,r.release_year,r.release_date,r.duration_ms,r.artwork_url,r.artwork_source_url,r.artwork_attribution,r.metadata_details from jsonb_populate_record(null::songs,${json(original)}) r) where id='respect-aretha';update song_metadata_jobs set (status,attempts,next_attempt_at,lease,lease_until,snapshot,candidates,error,artwork_permission)=(select r.status,r.attempts,r.next_attempt_at,r.lease,r.lease_until,r.snapshot,r.candidates,r.error,r.artwork_permission from jsonb_populate_record(null::song_metadata_jobs,${json(oldJob)}) r) where song_id='respect-aretha'`,
    );
  }
});
