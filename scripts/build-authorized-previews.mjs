// Only the explicitly reviewed CC BY recordings may be downloaded and redistributed by this script.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const recordings = JSON.parse(
  readFileSync("data/authorized-recordings.json", "utf8"),
);
const converter = process.env.MUSICALE_FFMPEG;
if (!converter)
  throw new Error(
    "Set MUSICALE_FFMPEG to an installed ffmpeg executable; conversion is an explicit development task.",
  );
const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
endpoint.search = new URLSearchParams({
  action: "query",
  format: "json",
  prop: "imageinfo",
  titles: recordings.map((r) => r.file).join("|"),
  iiprop: "url|mime|size|sha1|extmetadata",
  iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Restrictions",
});
const result = await fetch(endpoint, {
  headers: {
    "User-Agent": "Musicale/1.0 (https://github.com/yoonalexander/musicale)",
  },
  signal: AbortSignal.timeout(10000),
});
if (!result.ok)
  throw new Error(
    "Current source permissions unavailable; no recordings will be downloaded.",
  );
const metadata = await result.json();
mkdirSync("tmp/authorized-audio", { recursive: true });
mkdirSync("public/audio", { recursive: true });
const provenance = [];
for (const r of recordings) {
  const page = metadata.query.pages[r.pageId],
    info = page.imageinfo[0];
  if (
    page.title !== r.file ||
    String(page.pageid) !== r.pageId ||
    info.mime !== "audio/mpeg" ||
    info.duration < r.startSeconds + 15 ||
    info.extmetadata.Restrictions?.value ||
    !info.extmetadata.Artist?.value?.includes("Kevin MacLeod") ||
    info.extmetadata.LicenseShortName.value !== "CC BY 3.0" ||
    info.extmetadata.LicenseUrl.value.replace(/\/$/, "") !==
      "https://creativecommons.org/licenses/by/3.0"
  )
    throw new Error("Unapproved source");
  const url = new URL(info.url);
  url.search = "";
  if (url.origin !== "https://upload.wikimedia.org")
    throw new Error("Unapproved audio host");
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Musicale/1.0 (https://github.com/yoonalexander/musicale)",
    },
    signal: AbortSignal.timeout(60000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("audio/")
  )
    throw new Error(
      `Source unavailable (${response.status}); respect provider limits and retry later.`,
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== info.size)
    throw new Error(
      "Source recording size changed; review before redistribution.",
    );
  const sourceSha1 = createHash("sha1").update(bytes).digest("hex");
  if (sourceSha1 !== info.sha1)
    throw new Error(
      "Source recording checksum changed; review before redistribution.",
    );
  const input = resolve(`tmp/authorized-audio/${r.pageId}.mp3`),
    output = resolve(`public/audio/${r.pageId}.mp3`);
  writeFileSync(input, bytes);
  const result = spawnSync(
    converter,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-ss",
      String(r.startSeconds),
      "-t",
      "15",
      "-vn",
      "-map_metadata",
      "-1",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      output,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || "Audio conversion failed");
  const excerpt = readFileSync(output);
  provenance.push({
    songId: r.id,
    providerRecordingId: r.pageId,
    isrc: r.isrc,
    title: r.title,
    artist: r.artistName,
    source: url.href,
    authorization: info.descriptionurl,
    license: "https://creativecommons.org/licenses/by/3.0/",
    changes: `Excerpt ${r.startSeconds}–${r.startSeconds + 15}s, MP3 re-encoding, original metadata removed`,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    sourceSha1,
    asset: `/audio/${r.pageId}.mp3`,
    assetSha256: createHash("sha256").update(excerpt).digest("hex"),
    bytes: excerpt.length,
  });
  console.log(
    `${r.title}: licensed 15-second excerpt created (${excerpt.length} bytes)`,
  );
  await new Promise((resolve) => setTimeout(resolve, 1100));
}
writeFileSync(
  "data/audio-provenance.json",
  JSON.stringify(provenance, null, 2) + "\n",
);
