import assert from "node:assert/strict";
import {
  previewMatches,
  normalizeCommonsPreview,
  discoverPreviews,
  authorizedRecordings,
} from "../lib/preview-discovery";
import commons from "./fixtures/commons-previews.json";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import provenance from "../data/audio-provenance.json";
import { normalizeRecording, musicBrainzAdapter } from "../lib/music-catalog";
import { playablePreview, mapAudio } from "../lib/audio";
import { validateSong } from "../lib/validation";
import { youtubeVideoId } from "../lib/youtube";
import expansion from "../data/catalog-expansion-2026-10-17.json";
import starter from "../data/songs.json";
const records = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8"));
let passed = 0;
async function test(name: string, run: () => unknown) {
  await run();
  console.log(`PASS ${name}`);
  passed++;
}
await test("recordings normalize identifiers, dates, artists and core metadata without granting media permission", () => {
  const c = normalizeRecording(records[0]);
  assert.equal(c.song.releaseDate, "1967-03-10");
  assert.equal(c.song.artistName, "Aretha Franklin");
  assert.deepEqual(c.isrcs, ["USAT26700001"]);
  assert.equal(
    c.song.providers.find((p) => p.provider === "youtube")?.providerSongId,
    "JzqGZjFnYnA",
  );
  assert.equal(c.song.artworkUrl, null);
  assert.equal(c.artwork?.licensingStatus, "unreviewed");
  assert.equal(c.preview.licensingStatus, "unreviewed");
  assert.equal(c.song.status, "unavailable");
  assert.equal(c.song.genre, null);
  const partial = normalizeRecording({
    ...records[1],
    "first-release-date": "2000",
    length: null,
  });
  assert.equal(partial.song.releaseDate, null);
  assert.equal(partial.song.releaseYear, 2000);
  assert.throws(() =>
    normalizeRecording({ ...records[1], "first-release-date": "unknown" }),
  );
  assert.throws(() =>
    normalizeRecording({ ...records[1], id: "../../etc/passwd" }),
  );
});
await test("provider relationships never promote arbitrary or credential-bearing URLs to playback", () => {
  const c = normalizeRecording({
    ...records[1],
    relations: [
      {
        type: "streaming",
        url: { resource: "https://user:pass@open.spotify.com/track/123" },
      },
      {
        type: "streaming",
        url: { resource: "https://open.spotify.com.evil.test/track/123" },
      },
      {
        type: "other databases",
        url: { resource: "https://www.youtube.com/watch?v=unrelated" },
      },
      {
        type: "streaming",
        url: { resource: "https://open.spotify.com/track/verified" },
      },
    ],
  });
  assert.deepEqual(
    c.song.providers.map((p) => p.provider),
    ["musicbrainz", "spotify"],
  );
  assert.equal(c.song.providers[1].providerSongId, "verified");
});
await test("adapter reserves each request, sends a meaningful identity, bounds pages and reports provider outages", async () => {
  const original = globalThis.fetch;
  let reserved = 0,
    calls = 0;
  const adapter = musicBrainzAdapter(async () => {
    reserved++;
  });
  try {
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.origin, "https://musicbrainz.org");
      assert.match(
        (init?.headers as Record<string, string>)["User-Agent"],
        /Musicale.*github/,
      );
      assert.equal(init?.cache, "no-store");
      return Response.json(
        url.pathname.endsWith(records[0].id)
          ? records[0]
          : { recordings: [records[0], { id: "invalid" }], count: 2 },
      );
    };
    const results = await adapter.search("Aretha Respect", 0);
    assert.equal(results.candidates.length, 1);
    assert.equal(results.total, 2);
    assert.equal(
      (await adapter.lookup(records[0].id)).providerId,
      records[0].id,
    );
    assert.equal(reserved, calls);
    await assert.rejects(adapter.search("a", 0), /2–120/);
    await assert.rejects(adapter.search("artist", -1), /page/);
    await assert.rejects(
      adapter.lookup("https://evil.test"),
      /valid MusicBrainz/,
    );
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(adapter.search("artist", 0), /busy/);
  } finally {
    globalThis.fetch = original;
  }
});
await test("audio needs separate explicit authorization, availability, attribution and safe direct URLs", () => {
  const audio = {
    provider: "Licensed source",
    url: "https://audio.example.test/preview.mp3",
    availability: "available" as const,
    licensingStatus: "authorized" as const,
    authorizationUrl: "https://audio.example.test/license",
    attribution: "Artist, CC BY 4.0",
  };
  assert.equal(playablePreview(audio), audio);
  for (const change of [
    { licensingStatus: "unreviewed" },
    { licensingStatus: "rejected" },
    { availability: "unavailable" },
    { availability: "unknown" },
    { authorizationUrl: null },
    { attribution: "" },
    { provider: "" },
    { url: "http://audio.example.test/preview" },
    { url: "https://user:pass@example.test/preview" },
    { url: "javascript:alert(1)" },
  ])
    assert.equal(
      playablePreview({ ...audio, ...change } as typeof audio),
      null,
    );
  assert.equal(playablePreview(null), null);
  assert.equal(
    mapAudio({
      ...audio,
      licensing_status: "unreviewed",
      authorization_url: audio.authorizationUrl,
    })?.licensingStatus,
    "unreviewed",
  );
});
await test("reviewed open recordings match exact identities, reject ambiguous metadata and require current license evidence", async () => {
  for (const asset of provenance) {
    const bytes = readFileSync(`public${asset.asset}`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.assetSha256,
    );
    assert.ok(bytes.length > 100000 && bytes.length < 300000);
  }
  const recording = authorizedRecordings[0];
  const song = {
    id: "existing-id",
    title: recording.title,
    artist_name: recording.artistName,
    release_year: recording.releaseYear,
    duration_ms: recording.durationMs,
    catalog_sources: [],
    song_providers: [],
  };
  assert.equal(previewMatches(song, recording), true);
  assert.equal(
    previewMatches({ ...song, artist_name: "Different performer" }, recording),
    false,
  );
  assert.equal(
    previewMatches({ ...song, title: recording.title + " (Live)" }, recording),
    false,
  );
  assert.equal(
    previewMatches({ ...song, duration_ms: 90000 }, recording),
    false,
  );
  assert.equal(
    previewMatches(
      {
        ...song,
        catalog_sources: [
          {
            provider: "musicbrainz",
            provider_song_id: "id",
            isrcs: [recording.isrc],
          },
        ],
      },
      recording,
    ),
    true,
  );
  assert.equal(
    previewMatches(
      {
        ...song,
        catalog_sources: [
          { provider: "musicbrainz", provider_song_id: "id", isrcs: ["OTHER"] },
        ],
      },
      recording,
    ),
    false,
  );
  const mountain = authorizedRecordings[3];
  assert.equal(
    previewMatches(
      {
        ...song,
        song_providers: [
          {
            provider: "musicbrainz",
            provider_song_id: "04d422eb-c157-488e-8d01-70e535033bfa",
          },
        ],
      },
      mountain,
    ),
    true,
  );
  const page =
    commons.query.pages[recording.pageId as keyof typeof commons.query.pages];
  const audio = normalizeCommonsPreview(page, recording);
  assert.equal(audio.startSeconds, 0);
  assert.equal(audio.licensingStatus, "authorized");
  assert.equal(audio.url, `/audio/${recording.pageId}.mp3`);
  for (const change of [
    { ...page, pageid: 999 },
    {
      ...page,
      imageinfo: [{ ...page.imageinfo[0], url: "https://evil.test/music.mp3" }],
    },
    { ...page, imageinfo: [{ ...page.imageinfo[0], duration: 5 }] },
    {
      ...page,
      imageinfo: [
        {
          ...page.imageinfo[0],
          extmetadata: {
            ...page.imageinfo[0].extmetadata,
            LicenseUrl: { value: "https://example.test/not-permission" },
          },
        },
      ],
    },
  ])
    assert.throws(
      () => normalizeCommonsPreview(change, recording),
      /permission or recording/,
    );
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      return init?.method === "HEAD"
        ? new Response(null, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Access-Control-Allow-Origin": "*",
            },
          })
        : Response.json(commons);
    };
    assert.equal((await discoverPreviews([song])).length, 1);
    assert.equal(calls, 1);
    assert.equal(
      (await discoverPreviews([song, { ...song, id: "duplicate" }])).length,
      0,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(
      discoverPreviews(Array(1000).fill(song)),
      /complete catalog/,
    );
    await assert.rejects(discoverPreviews([song]), /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
await test("reviewed YouTube expansion has forty unique validated songs and new video identities", () => {
  assert.equal(expansion.length, 40);
  const ids = new Set(starter.map((song) => song.id));
  const videos = new Set(
    starter.flatMap((song) => song.providers.map((p) => p.providerSongId)),
  );
  for (const row of expansion) {
    const song = validateSong(row);
    assert(!ids.has(song.id));
    ids.add(song.id);
    assert.equal(song.providers.length, 1);
    const source = song.providers[0];
    assert.equal(source.provider, "youtube");
    assert.equal(youtubeVideoId(source.externalUrl), source.providerSongId);
    assert(!videos.has(source.providerSongId));
    videos.add(source.providerSongId);
    assert.equal(song.artworkUrl, null);
  }
});
console.log(`${passed} catalog and audio unit cases passed.`);
