import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  availableInRegion,
  searchYouTubeVideos,
  validateYouTubeVideos,
} from "../lib/youtube-data.ts";

const originalFetch = globalThis.fetch;
const id = "JzqGZjFnYnA";
const key = "test-key-that-must-not-appear-in-errors";
const item = {
  id,
  snippet: {
    title: "Respect (Official Audio)",
    channelTitle: "Aretha Franklin",
  },
  status: { embeddable: true, madeForKids: false },
  contentDetails: {
    duration: "PT2M28S",
    regionRestriction: { allowed: ["US"] },
  },
};
beforeEach(() => {
  process.env.YOUTUBE_API_KEY = key;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.YOUTUBE_API_KEY;
});

test("batch validation deduplicates IDs, validates payloads and preserves regional/kids restrictions", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.searchParams.get("key"), key);
    assert.equal(url.searchParams.get("id"), id);
    return Response.json({ items: [item, { id: "bad", snippet: {} }, null] });
  };
  const videos = await validateYouTubeVideos([id, id]);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].madeForKids, false);
  assert.equal(availableInRegion(videos[0], "CA"), false);
  assert.equal(availableInRegion(videos[0], "US"), true);
  assert.equal(
    availableInRegion(
      { ...videos[0], allowedRegions: null, blockedRegions: ["US"] },
      "US",
    ),
    false,
  );
});

test("discovery uses public embeddable search then validates and filters candidates", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname.endsWith("/search")) {
      assert.equal(url.searchParams.get("videoEmbeddable"), "true");
      assert.equal(url.searchParams.get("regionCode"), "CA");
      assert.equal(
        url.searchParams.get("q"),
        '"Aretha Franklin" "Respect" official audio',
      );
      return Response.json({
        items: [{ id: { videoId: id } }, { id: { videoId: "not-an-id" } }],
      });
    }
    return Response.json({ items: [item] });
  };
  assert.deepEqual(
    await searchYouTubeVideos("Aretha Franklin", "Respect", "CA"),
    [],
  );
  assert.deepEqual(requests, ["/youtube/v3/search", "/youtube/v3/videos"]);
});

test("missing kids status stays unknown and malformed videos are not considered valid", async () => {
  globalThis.fetch = async () =>
    Response.json({ items: [{ ...item, status: { embeddable: true } }] });
  assert.equal((await validateYouTubeVideos([id]))[0].madeForKids, null);
  globalThis.fetch = async () =>
    Response.json({ items: [{ ...item, status: { embeddable: "true" } }] });
  assert.deepEqual(await validateYouTubeVideos([id]), []);
});

test("invalid inputs fail before spending API quota", async () => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
  await assert.rejects(validateYouTubeVideos(["bad"]), /video IDs/);
  await assert.rejects(
    validateYouTubeVideos(
      Array.from({ length: 51 }, (_, index) => String(index).padStart(11, "0")),
    ),
    /video IDs/,
  );
  await assert.rejects(
    searchYouTubeVideos("artist", "song", "Canada"),
    /country/,
  );
  assert.deepEqual(await validateYouTubeVideos([]), []);
});

test("configuration, quota, network and JSON failures never echo the key or raw response", async () => {
  delete process.env.YOUTUBE_API_KEY;
  await assert.rejects(validateYouTubeVideos([id]), /not configured/);
  process.env.YOUTUBE_API_KEY = key;
  for (const fail of [
    async () => new Response(key, { status: 403 }),
    async () => {
      throw new Error(
        `https://www.googleapis.com/youtube/v3/videos?key=${key}`,
      );
    },
    async () => new Response(key, { status: 200 }),
    async () => Response.json({ wrong: key }),
  ]) {
    globalThis.fetch = fail;
    await assert.rejects(
      validateYouTubeVideos([id]),
      (error: Error) => !error.message.includes(key),
    );
  }
});
