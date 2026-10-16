import { validateSong, validDay, type SongInput } from "./validation";
import { safeProviderUrl } from "./providers";

export interface CatalogCandidate {
  provider: string;
  providerId: string;
  sourceUrl: string;
  metadataLicense: string;
  song: SongInput;
  isrcs: string[];
  artistIds: string[];
  releaseId: string | null;
  artwork: {
    url: string;
    sourceUrl: string;
    availability: "unknown";
    licensingStatus: "unreviewed";
  } | null;
  preview: { availability: "unknown"; licensingStatus: "unreviewed" };
}
export interface CatalogAdapter {
  search(
    query: string,
    offset: number,
  ): Promise<{ candidates: CatalogCandidate[]; total: number }>;
  lookup(id: string): Promise<CatalogCandidate>;
}
type Json = Record<string, any>;
const mbid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recordingId(id: string) {
  if (!mbid.test(id)) throw new Error("Choose a valid MusicBrainz recording.");
  return id.toLowerCase();
}
export function normalizeRecording(record: Json): CatalogCandidate {
  const id = recordingId(String(record.id));
  const credits: Json[] = Array.isArray(record["artist-credit"])
    ? record["artist-credit"]
    : [];
  const artist = credits
    .map((c) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`)
    .join("")
    .trim();
  const releases: Json[] = Array.isArray(record.releases)
    ? record.releases
    : [];
  const release = [...releases]
    .filter((r) => r.status === "Official" || !r.status)
    .sort(
      (a, b) =>
        String(a.date ?? "9999").localeCompare(String(b.date ?? "9999")) ||
        String(a.id).localeCompare(String(b.id)),
    )[0];
  const date = String(record["first-release-date"] ?? release?.date ?? "");
  const year = Number(date.slice(0, 4));
  const sourceUrl = `https://musicbrainz.org/recording/${id}`;
  const providers: SongInput["providers"] = [
    { provider: "musicbrainz", providerSongId: id, externalUrl: sourceUrl },
  ];
  // Only typed streaming/video relationships become listening links; a generic URL is not playback.
  for (const relation of (record.relations ?? []) as Json[]) {
    if (
      !["streaming", "free streaming", "paid streaming", "video"].includes(
        relation.type,
      )
    )
      continue;
    for (const provider of ["youtube", "spotify", "apple_music"] as const) {
      const url = safeProviderUrl(provider, relation.url?.resource);
      if (!url || providers.some((p) => p.provider === provider)) continue;
      const parsed = new URL(url);
      if (
        provider === "youtube" &&
        parsed.hostname !== "youtu.be" &&
        !parsed.searchParams.has("v") &&
        !/^\/(shorts|embed)\/[^/]+/.test(parsed.pathname)
      )
        continue;
      if (
        provider === "spotify" &&
        !/^\/track\/[^/]+\/?$/.test(parsed.pathname)
      )
        continue;
      if (
        provider === "apple_music" &&
        !parsed.searchParams.has("i") &&
        !parsed.pathname.includes("/song/")
      )
        continue;
      const providerSongId =
        provider === "youtube"
          ? (parsed.searchParams.get("v") ??
            parsed.pathname.split("/").filter(Boolean).at(-1))
          : provider === "apple_music"
            ? (parsed.searchParams.get("i") ??
              parsed.pathname.split("/").filter(Boolean).at(-1))
            : parsed.pathname.split("/").filter(Boolean).at(-1);
      if (providerSongId)
        providers.push({ provider, providerSongId, externalUrl: url });
    }
  }
  const releaseId = release?.id && mbid.test(release.id) ? release.id : null;
  return {
    provider: "musicbrainz",
    providerId: id,
    sourceUrl,
    metadataLicense: "CC0-1.0",
    song: validateSong({
      id: `mb-${id}`,
      title: String(record.title ?? "")
        .normalize("NFKC")
        .trim(),
      artistName: artist.normalize("NFKC"),
      albumName: String(release?.title ?? "Single")
        .normalize("NFKC")
        .trim(),
      releaseYear: year,
      releaseDate: validDay(date) ? date : null,
      durationMs: record.length ?? null,
      // MusicBrainz genres/tags are supplementary data, not covered by the core CC0 license.
      genre: null,
      status: "unavailable",
      artworkUrl: null,
      providers,
    }),
    isrcs: [
      ...new Set<string>(
        (record.isrcs ?? []).map((v: unknown) =>
          String(v).replace(/-/g, "").toUpperCase(),
        ),
      ),
    ].filter((v) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(v)),
    artistIds: credits.flatMap((c) =>
      c.artist?.id && mbid.test(c.artist.id) ? [c.artist.id] : [],
    ),
    releaseId,
    artwork: releaseId
      ? {
          url: `https://coverartarchive.org/release/${releaseId}/front`,
          sourceUrl: `https://musicbrainz.org/release/${releaseId}`,
          availability: "unknown",
          licensingStatus: "unreviewed",
        }
      : null,
    preview: { availability: "unknown", licensingStatus: "unreviewed" },
  };
}

// The caller reserves a shared database slot before every network request, across server instances.
export function musicBrainzAdapter(
  reserve: () => Promise<void>,
): CatalogAdapter {
  async function request(path: string, params: Record<string, string>) {
    await reserve();
    const url = new URL(`https://musicbrainz.org/ws/2/recording${path}`);
    url.search = new URLSearchParams({ fmt: "json", ...params }).toString();
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Musicale/0.1 (https://github.com/yoonalexander/musicale)",
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 503 || response.status === 429
          ? "MusicBrainz is busy. Wait a moment and retry."
          : "MusicBrainz could not load this request.",
      );
    const text = await response.text();
    if (text.length > 2_000_000)
      throw new Error("Catalog response is too large.");
    return JSON.parse(text) as Json;
  }
  return {
    async search(query, offset) {
      query = query.trim();
      if (
        query.length < 2 ||
        query.length > 120 ||
        /[\u0000-\u001f]/.test(query)
      )
        throw new Error("Search with 2–120 characters.");
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000)
        throw new Error("Invalid catalog page.");
      const result = await request("", {
        query,
        limit: "10",
        offset: String(offset),
      });
      const candidates = (
        Array.isArray(result.recordings) ? result.recordings : []
      ).flatMap((r: Json) => {
        try {
          return [normalizeRecording(r)];
        } catch {
          return [];
        }
      });
      return { candidates, total: Number(result.count ?? 0) };
    },
    async lookup(id) {
      return normalizeRecording(
        await request(`/${recordingId(id)}`, {
          inc: "artist-credits+releases+isrcs+url-rels",
        }),
      );
    },
  };
}
