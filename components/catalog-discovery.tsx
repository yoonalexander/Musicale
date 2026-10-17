"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  importExternalSongs,
  searchExternalCatalog,
  type CatalogSelection,
  type Duplicate,
} from "@/app/catalog-actions";
import type { CatalogCandidate } from "@/lib/music-catalog";
type Candidate = CatalogCandidate & { matches: Duplicate[] };
export function CatalogDiscovery({
  sources,
}: {
  sources: {
    song_id: string;
    provider_song_id: string;
    synced_at: string;
    metadata_license: string;
    source_url: string;
  }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function search(nextOffset: number) {
    setPending(true);
    setMessage("");
    try {
      const result = await searchExternalCatalog(query, nextOffset);
      setResults(result.candidates);
      setTotal(result.total);
      setOffset(nextOffset);
      setSelections({});
      setMessage(
        result.error ??
          (result.candidates.length
            ? "Review recordings before importing."
            : "No usable recordings found. Try an artist and song title."),
      );
    } catch {
      setMessage("Catalog request failed. Please retry.");
    } finally {
      setPending(false);
    }
  }
  async function ingest(selected: CatalogSelection[]) {
    setPending(true);
    setMessage("");
    try {
      const result = await importExternalSongs(selected);
      setMessage(
        result.error ??
          `${result.songIds.length} recordings imported or refreshed. Existing edits and ratings preserved. ${result.audioNotice ?? ""}`,
      );
      if (!result.error) {
        setSelections({});
        router.refresh();
      }
    } catch {
      setMessage("Import request failed. Please retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel">
      <h2>Discover music</h2>
      <p>
        Search MusicBrainz core metadata (CC0). Imported songs remain
        unavailable until you review their listening links and activate them in
        the song editor. Genres remain editorial; artwork needs separate
        permission.
      </p>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search(0);
        }}
      >
        <label>
          Search recordings
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Working…" : "Search MusicBrainz"}
        </button>
      </form>
      <p role="status">{message}</p>
      {results.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ingest(
              Object.entries(selections).map(([providerId, choice]) => ({
                providerId,
                targetSongId:
                  choice !== "new" && choice !== "auto" ? choice : undefined,
                createSeparate: choice === "new",
              })),
            );
          }}
        >
          <ul>
            {results.map((c) => (
              <li key={c.providerId}>
                <h3>
                  {c.song.title} — {c.song.artistName}
                </h3>
                <p>
                  {c.song.albumName} ·{" "}
                  {c.song.releaseDate ?? c.song.releaseYear} ·{" "}
                  {c.song.durationMs
                    ? `${Math.round(c.song.durationMs / 1000)} seconds`
                    : "Duration unknown"}
                </p>
                <p>
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    MusicBrainz recording
                  </a>{" "}
                  · {c.metadataLicense} · ISRC:{" "}
                  {c.isrcs.join(", ") || "not supplied"}
                </p>
                <p>
                  Audio: {c.preview.availability}; permission:{" "}
                  {c.preview.licensingStatus}.{" "}
                  {c.artwork ? (
                    <a
                      href={c.artwork.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Review release artwork (permission unreviewed)
                    </a>
                  ) : (
                    "No artwork source."
                  )}
                </p>
                {c.matches.length ? (
                  <p>
                    Possible duplicates:{" "}
                    {c.matches
                      .map((m) => `${m.song_id} (${m.reason})`)
                      .join(", ")}
                  </p>
                ) : (
                  <p>No existing match found.</p>
                )}
                <label>
                  Import choice for {c.song.title}
                  <select
                    value={selections[c.providerId] ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setSelections((current) => {
                        const next = { ...current };
                        if (e.target.value) next[c.providerId] = e.target.value;
                        else delete next[c.providerId];
                        return next;
                      })
                    }
                  >
                    <option value="">Skip this recording</option>
                    {c.matches.some((m) => m.reason === "identifier") ? (
                      <option value="auto">
                        Refresh existing identifier match
                      </option>
                    ) : (
                      <>
                        {c.matches.map((m) => (
                          <option key={m.song_id} value={m.song_id}>
                            Attach to {m.song_id}, preserve edits
                          </option>
                        ))}
                        <option value="new">Create separate recording</option>
                      </>
                    )}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          <button
            className="button"
            disabled={pending || !Object.keys(selections).length}
          >
            Import selected recordings
          </button>
        </form>
      ) : null}
      {offset > 0 ? (
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => void search(Math.max(0, offset - 10))}
        >
          Previous recordings
        </button>
      ) : null}
      {offset + 10 < total && offset < 1000 ? (
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => void search(offset + 10)}
        >
          Next recordings
        </button>
      ) : null}
      <details>
        <summary>Imported sources and metadata refresh</summary>
        <p>
          Refresh updates only fields still managed by discovery. Saving a song
          through the editor or manual import makes its metadata editorial.
          Existing listening links and artwork are preserved.
        </p>
        <ul>
          {sources.map((s) => (
            <li key={s.provider_song_id}>
              {s.song_id} · {s.metadata_license} · synced{" "}
              {s.synced_at.slice(0, 16)} UTC ·{" "}
              <a href={s.source_url} target="_blank" rel="noopener noreferrer">
                Source
              </a>{" "}
              <button
                className="button secondary"
                disabled={pending}
                onClick={() =>
                  void ingest([
                    { providerId: s.provider_song_id, targetSongId: s.song_id },
                  ])
                }
              >
                Refresh {s.song_id}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
