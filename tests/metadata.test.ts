import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseMetadata,
  rankMetadata,
  partialDate,
  metadataApi,
} from "../lib/metadata-enrichment";
const id = "11111111-1111-4111-8111-111111111111",
  releaseId = "22222222-2222-4222-8222-222222222222",
  groupId = "33333333-3333-4333-8333-333333333333";
const song = {
  id: "africa",
  title: "Africa",
  artist_name: "Toto",
  album_name: "Toto IV",
  release_year: 1982,
};
const record = {
  id,
  title: "Africa",
  "artist-credit": [{ name: "Toto" }],
  "first-release-date": "1982-04-08",
  isrcs: ["USSM18200001"],
  releases: [
    {
      id: releaseId,
      title: "Toto IV",
      date: "1982-04-08",
      status: "Official",
      "release-group": {
        id: groupId,
        "primary-type": "Album",
        "secondary-types": [],
      },
    },
  ],
};
test("exact artist, album and year permit a unique studio match", () => {
  assert.equal(chooseMetadata(rankMetadata(song, [record]))?.recordingId, id);
});
test("first search result can be a live video; ignore it", () => {
  assert.equal(
    chooseMetadata(
      rankMetadata(song, [
        {
          ...record,
          id: groupId,
          video: true,
          disambiguation: "live in Paris",
        },
        record,
      ]),
    )?.recordingId,
    id,
  );
});
test("competing originals and truncated search require review", () => {
  assert.equal(
    chooseMetadata(rankMetadata(song, [record, { ...record, id: groupId }])),
    null,
  );
  assert.equal(chooseMetadata(rankMetadata(song, [record]), true), null);
});
test("ISRC does not override artist, version, album or year conflicts", () => {
  const s = { ...song, isrcs: ["USSM18200001"] };
  for (const change of [
    { title: "Africa (remix)" },
    { disambiguation: "1999 remaster" },
    { "artist-credit": [{ name: "Someone else" }] },
    { "first-release-date": "1990" },
  ])
    assert.equal(
      chooseMetadata(rankMetadata(s, [{ ...record, ...change }])),
      null,
    );
});
test("compilations and unofficial releases cannot become album associations", () => {
  for (const change of [
    { status: "Bootleg" },
    {
      "release-group": {
        id: groupId,
        "primary-type": "Album",
        "secondary-types": ["Compilation"],
      },
    },
  ])
    assert.deepEqual(
      rankMetadata(song, [
        { ...record, releases: [{ ...record.releases[0], ...change }] },
      ]),
      [],
    );
});
test("partial dates stay partial, and invalid dates are rejected", () => {
  assert.equal(partialDate("1982"), "1982");
  assert.equal(partialDate("1982-04"), "1982-04");
  assert.equal(partialDate("1982-02-30"), null);
});
test("an explicitly named remix can match without being confused with the original", () => {
  const remix = {
    ...record,
    title: "Africa (Club Remix)",
    disambiguation: "Club remix",
  };
  assert.equal(
    chooseMetadata(rankMetadata({ ...song, title: remix.title }, [remix]))
      ?.recordingId,
    id,
  );
  assert.equal(chooseMetadata(rankMetadata(song, [remix])), null);
});
test("featured-artist punctuation and title credits do not change recording identity", () => {
  const featured = {
    ...record,
    title: "Africa",
    "artist-credit": [
      { name: "Toto", joinphrase: " featuring " },
      { name: "Guest" },
    ],
  };
  assert.equal(
    chooseMetadata(
      rankMetadata(
        {
          ...song,
          title: "Africa (feat. Guest)",
          artist_name: "Toto feat. Guest",
        },
        [featured],
      ),
    )?.recordingId,
    id,
  );
});
test("translated titles are review candidates rather than guessed originals", () => {
  const translated = {
    ...record,
    title: "アフリカ",
    aliases: [{ name: "Africa" }],
  };
  assert.equal(rankMetadata(song, [translated]).length, 1);
  assert.equal(chooseMetadata(rankMetadata(song, [translated])), null);
});
test("search does not exclude recordings because the existing editorial year is wrong", async () => {
  const original = globalThis.fetch;
  let query = "";
  globalThis.fetch = async (input) => {
    query = new URL(String(input)).searchParams.get("query") ?? "";
    return Response.json({ count: 1, recordings: [record] });
  };
  try {
    const result = await metadataApi(async () => {}).search({
      ...song,
      release_year: 1980,
    });
    assert.equal(query.includes("firstreleasedate"), false);
    assert.equal(result.candidates.length, 1);
    assert.equal(chooseMetadata(result.candidates), null);
  } finally {
    globalThis.fetch = original;
  }
});
test("API reserves every MB request and caches duplicate lookups", async () => {
  const original = globalThis.fetch;
  let calls = 0,
    slots = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify(record), { status: 200 });
  };
  try {
    const api = metadataApi(async () => {
      slots++;
    });
    await api.lookup(song, id);
    await api.lookup(song, id);
    assert.equal(calls, 1);
    assert.equal(slots, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("a selected edition omitted from a recording lookup is verified through its track list", async () => {
  const original = globalThis.fetch;
  let slots = 0;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    return Response.json(
      url.pathname.includes("/release/")
        ? {
            ...record.releases[0],
            media: [{ tracks: [{ recording: { id } }] }],
          }
        : { ...record, releases: [] },
    );
  };
  try {
    const result = await metadataApi(async () => {
      slots++;
    }).lookup(song, id, releaseId);
    assert.equal(result?.recordingId, id);
    assert.equal(result?.releaseId, releaseId);
    assert.equal(slots, 2);
    assert.deepEqual(calls, [
      `/ws/2/recording/${id}`,
      `/ws/2/release/${releaseId}`,
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("a selected edition must actually contain the requested recording", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).includes("/release/")
        ? {
            ...record.releases[0],
            media: [{ tracks: [{ recording: { id: groupId } }] }],
          }
        : { ...record, releases: [] },
    );
  try {
    assert.equal(
      await metadataApi(async () => {}).lookup(song, id, releaseId),
      null,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("throttled requests reserve a new slot before retry", async () => {
  const original = globalThis.fetch;
  let calls = 0,
    slots = 0;
  globalThis.fetch = async () =>
    ++calls === 1 ? new Response("", { status: 503 }) : Response.json(record);
  try {
    await metadataApi(async () => {
      slots++;
    }).lookup(song, id);
    assert.equal(calls, 2);
    assert.equal(slots, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("a unique original single can fill an unknown album; an unqualified live version cannot", () => {
  const single = {
    ...record,
    releases: [
      {
        ...record.releases[0],
        title: "Africa",
        "release-group": {
          ...record.releases[0]["release-group"],
          "primary-type": "Single",
        },
      },
    ],
  };
  assert.equal(
    chooseMetadata(rankMetadata({ ...song, album_name: "Single" }, [single]))
      ?.recordingId,
    id,
  );
  assert.equal(
    chooseMetadata(
      rankMetadata({ ...song, title: "Live Forever" }, [
        { ...record, title: "Live Forever", disambiguation: "live" },
      ]),
    ),
    null,
  );
});
