import recordings from "@/data/authorized-recordings.json";
import provenance from "@/data/audio-provenance.json";
import type { AudioPreview } from "./audio";
export { recordings as authorizedRecordings };
type Recording = (typeof recordings)[number];
export interface PreviewSong {
  id: string;
  title: string;
  artist_name: string;
  release_year: number;
  duration_ms: number | null;
  catalog_sources: {
    isrcs: string[];
    provider: string;
    provider_song_id: string;
  }[];
  song_providers: { provider: string; provider_song_id: string }[];
}
const key = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function previewMatches(song: PreviewSong, recording: Recording) {
  const mbId =
    recording.isrc === "USUAN1200072"
      ? "04d422eb-c157-488e-8d01-70e535033bfa"
      : null;
  if (
    mbId &&
    [...song.catalog_sources, ...song.song_providers].some(
      (p) => p.provider === "musicbrainz" && p.provider_song_id === mbId,
    )
  )
    return true;
  const codes = song.catalog_sources.flatMap((s) => s.isrcs);
  if (codes.length) return codes.includes(recording.isrc);
  return (
    key(song.title) === key(recording.title) &&
    key(song.artist_name) === key(recording.artistName) &&
    song.release_year === recording.releaseYear &&
    (song.duration_ms === null ||
      Math.abs(song.duration_ms - recording.durationMs) < 2000)
  );
}
export function normalizeCommonsPreview(
  page: any,
  recording: Recording,
): AudioPreview {
  const info = page?.imageinfo?.[0],
    metadata = info?.extmetadata;
  const license = metadata?.LicenseUrl?.value?.replace(/\/$/, "");
  const url = new URL(info?.url ?? "https://invalid.invalid");
  if (
    String(page?.pageid) !== recording.pageId ||
    info?.sha1 !==
      provenance.find((p) => p.providerRecordingId === recording.pageId)
        ?.sourceSha1 ||
    page.title !== recording.file ||
    info?.mime !== "audio/mpeg" ||
    info.duration < recording.startSeconds + 15 ||
    !Number.isFinite(info.duration) ||
    metadata?.LicenseShortName?.value !== "CC BY 3.0" ||
    license !== "https://creativecommons.org/licenses/by/3.0" ||
    metadata?.Restrictions?.value ||
    !key(metadata?.Artist?.value ?? "").includes(key(recording.artistName)) ||
    url.protocol !== "https:" ||
    url.hostname !== "upload.wikimedia.org" ||
    url.username ||
    url.password ||
    !info.descriptionurl?.startsWith("https://commons.wikimedia.org/wiki/File:")
  )
    throw new Error(
      `Audio permission or recording metadata changed for ${recording.title}; review the source before retrying.`,
    );
  url.search = "";
  return {
    provider: "wikimedia_commons",
    providerRecordingId: recording.pageId,
    url: `/audio/${recording.pageId}.mp3`,
    availability: "available",
    licensingStatus: "authorized",
    authorizationUrl: info.descriptionurl,
    licenseUrl: license,
    attribution: `${recording.title} — Kevin MacLeod (incompetech.com), CC BY 3.0. Composition: ${recording.isrc === "USUAN1200072" ? "Edvard Grieg" : "Erik Satie"}. Trimmed to ${recording.startSeconds}–${recording.startSeconds + 15}s; re-encoded as MP3.`,
    startSeconds: 0,
  };
}
export async function discoverPreviews(songs: PreviewSong[]) {
  if (songs.length >= 1000)
    throw new Error(
      "Preview discovery requires a complete catalog below 1000 songs; add pagination before expanding this catalog.",
    );
  const matched = recordings.flatMap((recording) => {
    const matches = songs.filter((s) => previewMatches(s, recording));
    return matches.length === 1 ? [{ recording, song: matches[0] }] : [];
  });
  if (!matched.length) return [];
  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    titles: matched.map((m) => m.recording.file).join("|"),
    iiprop: "url|mime|size|sha1|extmetadata",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Restrictions",
  }).toString();
  const response = await fetch(endpoint, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Musicale/1.0 (https://github.com/yoonalexander/musicale)",
    },
  });
  if (!response.ok)
    throw new Error(
      "Wikimedia preview discovery is unavailable. Saved catalog data is unchanged; retry discovery later.",
    );
  const text = await response.text();
  if (text.length > 200000)
    throw new Error("Preview metadata response is too large.");
  const pages = JSON.parse(text).query?.pages;
  if (!pages) throw new Error("Wikimedia returned no recording metadata.");
  return matched.map(({ song, recording }) => ({
    songId: song.id,
    ...normalizeCommonsPreview(pages[recording.pageId], recording),
  }));
}
