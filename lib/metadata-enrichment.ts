// Portable between the Next.js admin tools and the scheduled Supabase worker.
export type RecordData = Record<string, any>;
export interface MetadataSong {
  id: string;
  title: string;
  artist_name: string;
  album_name: string;
  release_year: number;
  duration_ms?: number | null;
  isrcs?: string[];
  recording_id?: string | null;
  genre?: string | null;
}
export const metadataKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const alternate =
  /\b(live|remix|remaster(?:ed)?|edit|demo|karaoke|instrumental|acoustic|re-record(?:ed|ing)?|sped up|slowed)\b/i;
const titleKey = (s: string) =>
  metadataKey(
    s
      .replace(/\s*[([](?:feat\.?|featuring|ft\.?)\s[^)\]]*[)\]]/gi, "")
      .replace(/\s+(?:feat\.?|featuring|ft\.?)\s.*$/i, ""),
  );
const creditKey = (s: string) =>
  metadataKey(s.replace(/\b(?:featuring|feat|ft)\.?\s*/gi, ""));
const primaryArtist = (s: string) =>
  s.split(/\s+(?:featuring|feat\.?|ft\.?)\s/i)[0];
function versions(s: string) {
  return [
    ...new Set(
      (s.match(new RegExp(alternate.source, "gi")) ?? []).map((v) =>
        v.toLowerCase().replace(/remastered/, "remaster"),
      ),
    ),
  ]
    .sort()
    .join(",");
}
function titleVersions(s: string) {
  return versions(
    (s.match(/(?:[(\[]|\s[-–—]\s)[^)\]]+/g) ?? []).join(" ") +
      " " +
      s.replace(/\blive\b/gi, ""),
  );
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const metadataId = (value: string) => {
  if (!uuid.test(value)) throw new Error("Enter a MusicBrainz UUID.");
  return value.toLowerCase();
};
export function partialDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}(-\d{2})?(-\d{2})?$/.test(value))
    return null;
  const full =
    value.length === 4
      ? `${value}-01-01`
      : value.length === 7
        ? `${value}-01`
        : value;
  const parsed = new Date(`${full}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === full
    ? value
    : null;
}
function artist(record: RecordData): string {
  return (record["artist-credit"] ?? [])
    .map(
      (c: RecordData) =>
        `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`,
    )
    .join("");
}
export function rankMetadata(song: MetadataSong, records: RecordData[]) {
  return records
    .flatMap((record) => {
      if (!uuid.test(record.id ?? "") || record.video === true) return [];
      const exactTitle = titleKey(record.title ?? "") === titleKey(song.title);
      const titleAlias =
        (record.aliases ?? []).some(
          (a: RecordData) => titleKey(a.name ?? "") === titleKey(song.title),
        ) ||
        String(record.title ?? "")
          .split(/[()[\]]/)
          .some((part) => titleKey(part) === titleKey(song.title));
      const exactArtist =
        creditKey(artist(record)) === creditKey(song.artist_name);
      const credits: RecordData[] = record["artist-credit"] ?? [];
      const relatedArtist = credits.some((c) =>
        [
          c.name,
          c.artist?.name,
          ...(c.artist?.aliases ?? []).map((a: RecordData) => a.name),
        ].some(
          (name) =>
            name &&
            creditKey(name) === creditKey(primaryArtist(song.artist_name)),
        ),
      );
      if (!exactArtist && !relatedArtist) return [];
      const wantedVersion = titleVersions(song.title);
      const actualVersion = [
        ...new Set(
          (
            titleVersions(record.title ?? "") +
            "," +
            versions(record.disambiguation ?? "")
          )
            .split(",")
            .filter(Boolean),
        ),
      ]
        .sort()
        .join(",");
      const versionConflict = wantedVersion !== actualVersion;
      const releases: RecordData[] = (record.releases ?? []).filter(
        (r: RecordData) =>
          r.status === "Official" &&
          uuid.test(r.id ?? "") &&
          uuid.test(r["release-group"]?.id ?? "") &&
          ["Album", "Single", "EP"].includes(
            r["release-group"]["primary-type"],
          ) &&
          !(r["release-group"]["secondary-types"] ?? []).some(
            (type: string) =>
              ["Compilation", "DJ-mix", "Live"].includes(type) ||
              (type === "Remix" && !wantedVersion.includes("remix")),
          ) &&
          partialDate(r.date),
      );
      const knownAlbum = !["", "single", "unknown"].includes(
        song.album_name.toLowerCase(),
      );
      const matching = releases.filter(
        (r) => metadataKey(r.title) === metadataKey(song.album_name),
      );
      if (!exactTitle && !titleAlias && !matching.length) return [];
      const release = [...(matching.length ? matching : releases)].sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          a.id.localeCompare(b.id),
      )[0];
      if (!release) return [];
      const originalDate = partialDate(record["first-release-date"]);
      const isrcs = (record.isrcs ?? [])
        .map((s: string) => s.replace(/-/g, "").toUpperCase())
        .filter((s: string) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s));
      const identifier =
        song.recording_id === record.id ||
        isrcs.some((s: string) => song.isrcs?.includes(s));
      const year = Number(originalDate?.slice(0, 4));
      const duration =
        song.duration_ms && record.length
          ? Math.abs(song.duration_ms - record.length)
          : null;
      const albumMatches = matching.length > 0;
      const singleMatches =
        release["release-group"]["primary-type"] === "Single" &&
        titleKey(release.title) === titleKey(song.title);
      // A known album, year or duration conflict always needs human review, even with an ISRC.
      const conflict =
        !exactTitle ||
        !exactArtist ||
        versionConflict ||
        (knownAlbum && !albumMatches) ||
        !year ||
        year !== song.release_year ||
        (duration !== null && duration > 5000);
      const confidence = conflict
        ? 0.75
        : identifier
          ? 1
          : albumMatches
            ? 0.97
            : singleMatches || (duration !== null && duration <= 2000)
              ? 0.96
              : 0.9;
      return [
        {
          recordingId: record.id as string,
          title: record.title as string,
          artist: artist(record),
          albumName: release.title as string,
          originalDate,
          albumDate: partialDate(release.date),
          releaseId: release.id as string,
          releaseGroupId: release["release-group"].id as string,
          isrcs,
          durationMs: record.length ?? null,
          confidence,
          requiresReview: conflict,
          reason: conflict
            ? [
                !exactTitle ? "Translated or different title" : "",
                !exactArtist
                  ? "Artist alias or incomplete featured credits"
                  : "",
                versionConflict ? "Recording version differs" : "",
                knownAlbum && !albumMatches ? "Album differs" : "",
                !year || year !== song.release_year
                  ? "Original year differs or is missing"
                  : "",
                duration !== null && duration > 5000 ? "Duration differs" : "",
              ]
                .filter(Boolean)
                .join("; ") + ". Review required."
            : identifier
              ? "Recording ID or ISRC, title, artist and release agree."
              : "Exact title and credited artists; original year and official release agree.",
        },
      ];
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.recordingId.localeCompare(b.recordingId),
    );
}
export type MetadataCandidate = ReturnType<typeof rankMetadata>[number] & {
  genreSuggestions?: string[];
  genreLicense?: string;
  artwork?: {
    url: string;
    sourceUrl: string;
    releaseId?: string;
    imageId?: string | null;
    status: "permission_required";
  } | null;
};
export function chooseMetadata(
  candidates: MetadataCandidate[],
  truncated = false,
) {
  const [first, second] = candidates;
  return !truncated &&
    first &&
    !first.requiresReview &&
    first.confidence >= 0.96 &&
    (!second || first.confidence - second.confidence >= 0.04)
    ? first
    : null;
}
export function metadataApi(reserve: () => Promise<void>) {
  const cache = new Map<string, Promise<RecordData>>();
  async function request(url: string, musicbrainz = true): Promise<RecordData> {
    if (cache.has(url)) return cache.get(url)!;
    const pending = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (musicbrainz) await reserve();
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Musicale/0.1 (https://github.com/yoonalexander/musicale)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        });
        if (!musicbrainz && response.status === 404) return { images: [] };
        if (
          [429, 500, 502, 503, 504].includes(response.status) &&
          attempt < 2
        ) {
          const retry = Number(response.headers.get("Retry-After"));
          if (retry > 10)
            throw new Error(
              "Provider requested a longer retry; queued for later.",
            );
          await new Promise((r) =>
            setTimeout(r, Math.max(1100 * 2 ** attempt, retry * 1000 || 0)),
          );
          continue;
        }
        if (!response.ok)
          throw new Error(`Metadata provider returned ${response.status}.`);
        const text = await response.text();
        if (text.length > 4_000_000)
          throw new Error("Metadata response too large.");
        return JSON.parse(text);
      }
      throw new Error("Metadata provider unavailable.");
    })();
    cache.set(url, pending);
    return pending;
  }
  return {
    async search(song: MetadataSong) {
      const escape = (s: string) =>
        s.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ").trim();
      const codes = (song.isrcs ?? []).filter((s) =>
        /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s),
      );
      const knownAlbum = !["", "single", "unknown"].includes(
        song.album_name.toLowerCase(),
      );
      const title = song.title.replace(
        /\s*[([](?:feat\.?|featuring|ft\.?)\s[^)\]]*[)\]]/gi,
        "",
      );
      const base = `recording:"${escape(title)}" AND artist:"${escape(primaryArtist(song.artist_name))}"`;
      const query = codes.length
        ? codes.map((s) => `isrc:${s}`).join(" OR ")
        : base +
          (knownAlbum ? ` AND release:"${escape(song.album_name)}"` : "");
      let result = await request(
        `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query, fmt: "json", limit: "100" })}`,
      );
      if (!codes.length && !(result.recordings ?? []).length && knownAlbum)
        result = await request(
          `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query: base, fmt: "json", limit: "100" })}`,
        );
      let candidates = rankMetadata(song, result.recordings ?? []);
      if (!codes.length && !candidates.length && knownAlbum) {
        const translated = await request(
          `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query: `artist:"${escape(primaryArtist(song.artist_name))}" AND release:"${escape(song.album_name)}"`, fmt: "json", limit: "100" })}`,
        );
        candidates = rankMetadata(song, translated.recordings ?? []).map(
          (c) => ({
            ...c,
            requiresReview: true,
            confidence: Math.min(c.confidence, 0.9),
            reason:
              c.reason +
              " Found through an album/artist search; confirm the title.",
          }),
        );
        result = translated;
      }
      return {
        candidates,
        truncated: Number(result.count) > 100,
      };
    },
    async lookup(song: MetadataSong, id: string, releaseId?: string) {
      const record = await request(
        `https://musicbrainz.org/ws/2/recording/${metadataId(id)}?fmt=json&inc=artist-credits+releases+release-groups+isrcs${song.genre ? "" : "+genres"}`,
      );
      let releases = record.releases ?? [];
      if (releaseId) {
        const editionId = metadataId(releaseId);
        let edition = releases.find((r: RecordData) => r.id === editionId);
        // Recording lookups include only 25 releases; verify an omitted edition directly.
        if (!edition) {
          edition = await request(
            `https://musicbrainz.org/ws/2/release/${editionId}?fmt=json&inc=recordings+release-groups`,
          );
          if (
            edition.id !== editionId ||
            !(edition.media ?? []).some((medium: RecordData) =>
              (medium.tracks ?? []).some(
                (track: RecordData) => track.recording?.id === record.id,
              ),
            )
          )
            return null;
        }
        releases = [edition];
      }
      const candidate = rankMetadata(song, [{ ...record, releases }])[0];
      if (!candidate) return null;
      return {
        ...candidate,
        genreSuggestions: !song.genre
          ? ((record.genres ?? [])
              .filter(
                (g: RecordData) =>
                  typeof g.name === "string" && Number(g.count) > 0,
              )
              .map((g: RecordData) => String(g.name).slice(0, 100))
              .slice(0, 10) as string[])
          : [],
        genreLicense: "CC-BY-NC-SA-3.0",
      };
    },
    async artwork(candidate: MetadataCandidate) {
      let result = await request(
        `https://coverartarchive.org/release/${metadataId(candidate.releaseId)}`,
        false,
      );
      if (
        !(result.images ?? []).some(
          (i: RecordData) => i.front === true && i.approved === true,
        )
      )
        result = await request(
          `https://coverartarchive.org/release-group/${metadataId(candidate.releaseGroupId)}`,
          false,
        );
      const front = (result.images ?? []).find(
        (i: RecordData) => i.front === true && i.approved === true,
      );
      if (!front) return null;
      const releaseMatch = String(
        result.release ??
          `https://musicbrainz.org/release/${candidate.releaseId}`,
      ).match(/^https?:\/\/musicbrainz\.org\/release\/([a-f0-9-]{36})\/?$/i);
      if (!releaseMatch) return null;
      const releaseId = metadataId(releaseMatch[1]);
      const imageId = /^\d+$/.test(String(front.id)) ? String(front.id) : null;
      const thumbnail = String(front.thumbnails?.["500"] ?? "").replace(
        /^http:/,
        "https:",
      );
      const pinned =
        imageId &&
        new RegExp(
          `^https://coverartarchive\\.org/release/${releaseId}/${imageId}-500\\.(?:jpg|jpeg|png)$`,
          "i",
        ).test(thumbnail)
          ? thumbnail
          : null;
      // CAA availability and community approval are not permission to reuse the image.
      return {
        url:
          pinned ??
          `https://coverartarchive.org/release/${releaseId}/front-500`,
        sourceUrl: `https://musicbrainz.org/release/${releaseId}`,
        releaseId,
        imageId: pinned ? imageId : null,
        status: "permission_required" as const,
      };
    },
  };
}
