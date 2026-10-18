import assert from "node:assert/strict";
import { test } from "node:test";
import { runMetadataJob } from "../lib/metadata-jobs";
const id = "11111111-1111-4111-8111-111111111111",
  release = "22222222-2222-4222-8222-222222222222",
  group = "33333333-3333-4333-8333-333333333333";
test("a claimed song is verified, its artwork stays unapproved, and metadata reaches the save RPC", async () => {
  const original = globalThis.fetch;
  const record = {
    id,
    title: "Africa",
    "artist-credit": [{ name: "Toto" }],
    "first-release-date": "1982-04-08",
    isrcs: [],
    releases: [
      {
        id: release,
        title: "Toto IV",
        date: "1982",
        status: "Official",
        "release-group": {
          id: group,
          "primary-type": "Album",
          "secondary-types": [],
        },
      },
    ],
  };
  let saved: any = null,
    slots = 0;
  const db = {
    rpc: async (name: string, args: any) => {
      if (name === "claim_song_metadata")
        return {
          data: {
            song: {
              id: "africa",
              title: "Africa",
              artist_name: "Toto",
              album_name: "Toto IV",
              release_year: 1982,
              genre: "Rock",
            },
            lease: id,
          },
        };
      if (name === "reserve_catalog_provider_call") {
        slots++;
        return { data: true };
      }
      if (name === "finish_song_metadata") {
        saved = args;
        return { error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    return Response.json(
      url.hostname === "coverartarchive.org"
        ? { images: [{ front: true, approved: true }] }
        : url.searchParams.has("query")
          ? { count: 1, recordings: [record] }
          : record,
    );
  };
  try {
    assert.equal((await runMetadataJob(db)).status, "enriched");
    assert.equal(slots, 2);
    assert.equal(saved.p_lease, id);
    assert.equal(saved.p_selected.recordingId, id);
    assert.equal(saved.p_selected.artwork.status, "permission_required");
  } finally {
    globalThis.fetch = original;
  }
});
test("an empty queue makes no provider request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Unexpected request");
  };
  try {
    assert.deepEqual(
      await runMetadataJob({ rpc: async () => ({ data: null }) }),
      { status: "idle" },
    );
  } finally {
    globalThis.fetch = original;
  }
});
