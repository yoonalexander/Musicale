"use client";
import { useEffect, useState, useTransition } from "react";
import {
  metadataProgress,
  enrichNextSong,
  enrichSongMetadata,
  retryMetadata,
  reviewMetadata,
  authorizeMetadataArtwork,
} from "@/app/metadata-actions";
import type { MetadataCandidate } from "@/lib/metadata-enrichment";
type Job = {
  song_id: string;
  status: string;
  attempts: number;
  error: string | null;
  candidates: MetadataCandidate[];
  artwork_permission: {
    status?: string;
    basis?: string;
    evidence?: string;
    scope?: string;
    attribution?: string;
  } | null;
  songs: {
    title: string;
    artist_name: string;
    album_name: string;
    release_year: number;
    artwork_url: string | null;
  };
};
type Run = (action: () => Promise<unknown>) => void;
function JobReview({
  job,
  name,
  pending,
  run,
}: {
  job: Job;
  name: string;
  pending: boolean;
  run: Run;
}) {
  const cover = job.candidates[0]?.artwork;
  const permission = job.artwork_permission;
  return (
    <details>
      <summary>
        {name} · {job.status} · {job.attempts} attempts
      </summary>
      <p>
        Current: {job.songs.artist_name} · {job.songs.album_name} ·{" "}
        {job.songs.release_year}. Artwork:{" "}
        {job.songs.artwork_url ? "published" : "not published"}; rights:{" "}
        {permission?.status ?? "pending"}.
      </p>
      {job.error ? (
        <p role="alert">
          {job.error.startsWith("Artwork lookup failed:")
            ? `Recording match saved. No need to review this match again. ${job.error}`
            : job.error}
        </p>
      ) : null}
      <button
        disabled={pending}
        onClick={() => run(() => retryMetadata(job.song_id))}
      >
        Queue this song again
      </button>{" "}
      <button
        disabled={pending}
        onClick={() =>
          run(async () => {
            await retryMetadata(job.song_id);
            return enrichSongMetadata(job.song_id);
          })
        }
      >
        Refresh metadata and artwork now
      </button>
      <form action={(form) => run(() => reviewMetadata(form))}>
        <input type="hidden" name="songId" value={job.song_id} />
        <input
          type="hidden"
          name="expectedYear"
          value={job.songs.release_year}
        />
        <input
          type="hidden"
          name="expectedAlbum"
          value={job.songs.album_name}
        />
        <fieldset>
          <legend>Choose a recording and release edition</legend>
          {job.candidates.map((c) => (
            <label
              key={c.recordingId + ":" + c.releaseId}
              style={{ display: "block", marginBlock: "1rem" }}
            >
              <input
                type="radio"
                name="candidate"
                value={`${c.recordingId}:${c.releaseId}`}
              />{" "}
              {c.artist} — {c.title} · {c.albumName} · original{" "}
              {c.originalDate ?? "unknown"} · edition {c.albumDate ?? "unknown"}
              <span style={{ display: "block" }}>{c.reason}</span>
              <a
                href={`https://musicbrainz.org/recording/${c.recordingId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Recording evidence
              </a>
              {" · "}
              <a
                href={`https://musicbrainz.org/release/${c.releaseId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Release edition
              </a>
              {c.genreSuggestions?.length ? (
                <span>
                  {" "}
                  · Genre suggestions: {c.genreSuggestions.join(", ")}{" "}
                  (MusicBrainz, {c.genreLicense})
                </span>
              ) : null}
            </label>
          ))}
          {!job.candidates.length ? (
            <p>
              No safe candidates. Supply a verified MusicBrainz recording and
              edition below.
            </p>
          ) : null}
        </fieldset>
        <details>
          <summary>Use another recording or edition</summary>
          <label>
            Recording MBID
            <input name="recordingId" />
          </label>
          <label>
            Release edition MBID
            <input name="releaseId" />
          </label>
        </details>
        <label>
          <input type="checkbox" name="verifiedMatch" required />I verified the
          song, credited artists, version and release edition.
        </label>
        <label>
          <input type="checkbox" name="applyAlbum" />
          Replace the current album with this reviewed album.
        </label>
        <label>
          <input type="checkbox" name="applyYear" />
          Replace the current original year/date with this reviewed year/date.
        </label>
        <button disabled={pending}>Save reviewed association</button>
      </form>
      <h3>Artwork permission</h3>
      <p>
        CAA availability and its “approved” flag identify an image; they do not
        grant reuse rights. Attribution alone is insufficient. Keep the
        placeholder unless rights cover this exact image and Musicale’s use.
      </p>
      {cover ? (
        <p>
          <a href={cover.sourceUrl} target="_blank" rel="noopener noreferrer">
            Review cover source
          </a>{" "}
          ·{" "}
          {cover.imageId
            ? `Image ID ${cover.imageId}`
            : "Refresh to pin the exact image before approval."}
        </p>
      ) : (
        <p>No cover found for this association.</p>
      )}
      {permission?.evidence ? (
        <p>
          Recorded evidence:{" "}
          <a
            href={permission.evidence}
            target="_blank"
            rel="noopener noreferrer"
          >
            rights evidence
          </a>{" "}
          · {permission.scope}
        </p>
      ) : null}
      {cover?.imageId && !job.songs.artwork_url ? (
        <form action={(form) => run(() => authorizeMetadataArtwork(form))}>
          <input name="songId" type="hidden" value={job.song_id} />
          <input name="decision" type="hidden" value="authorized" />
          <label>
            Rights basis
            <select name="basis" required>
              <option value="">Choose a documented basis</option>
              <option value="direct_permission">
                Direct permission from the rights holder
              </option>
              <option value="open_license">Image-specific open license</option>
              <option value="public_domain">Verified public domain</option>
              <option value="owned">Artwork owned by Musicale</option>
            </select>
          </label>
          <label>
            Permission evidence URL
            <input name="evidence" type="url" required maxLength={2000} />
          </label>
          <label>
            What permits this exact image on Musicale?
            <textarea name="scope" minLength={20} maxLength={2000} required />
          </label>
          <label>
            Required attribution and license
            <input name="attribution" required maxLength={1000} />
          </label>
          <label>
            <input name="permission" type="checkbox" required />I verified this
            evidence permits the stated use; public availability and attribution
            are not my basis.
          </label>
          <button disabled={pending}>Publish permitted cover</button>
        </form>
      ) : null}
      <div className="actions">
        {["pending", "rejected"].map((decision) => (
          <button
            key={decision}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const form = new FormData();
                form.set("songId", job.song_id);
                form.set("decision", decision);
                return authorizeMetadataArtwork(form);
              })
            }
          >
            {decision === "pending"
              ? "Leave rights pending"
              : "Reject or withdraw cover permission"}
          </button>
        ))}
      </div>
    </details>
  );
}
export function MetadataEnrichment({
  names,
}: {
  names: Record<string, string>;
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("review"),
    [search, setSearch] = useState(""),
    [pending, start] = useTransition();
  const reload = async () =>
    setJobs((await metadataProgress()) as unknown as Job[]);
  useEffect(() => {
    reload().catch(() => setNotice("Metadata progress is unavailable."));
  }, []);
  const run: Run = (action) =>
    start(async () => {
      try {
        const result = await action();
        if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error
        )
          throw new Error(String(result.error));
        await reload();
        setNotice(
          result &&
            typeof result === "object" &&
            "warning" in result &&
            result.warning
            ? String(result.warning)
            : "Metadata work saved.",
        );
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Metadata work failed.",
        );
        await reload().catch(() => {});
      }
    });
  const counts = jobs.reduce<Record<string, number>>(
    (all, j) => ((all[j.status] = (all[j.status] ?? 0) + 1), all),
    {},
  );
  const shown = jobs.filter(
    (job) =>
      (filter === "all" ||
        (filter === "artwork"
          ? !job.songs.artwork_url &&
            Boolean(job.candidates[0]?.artwork) &&
            job.artwork_permission?.status !== "rejected"
          : job.status === filter)) &&
      `${names[job.song_id]} ${job.songs.artist_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <h2>Album metadata</h2>
      <p>
        Fill missing fields automatically; review conflicts before changing
        editorial metadata. Match scores are rules, not probabilities. Artwork
        publication requires separate image-specific rights evidence.
      </p>
      <p>
        {Object.entries(counts)
          .map(([status, count]) => `${count} ${status}`)
          .join(" · ") || "No metadata jobs."}
      </p>
      <div className="actions">
        <button
          className="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              for (let i = 0; i < 5; i++) {
                const result = await enrichNextSong();
                if (result.status === "idle") break;
                await reload();
              }
            })
          }
        >
          {pending ? "Processing…" : "Enrich next 5 songs"}
        </button>
        <button disabled={pending} onClick={() => run(reload)}>
          Refresh progress
        </button>
      </div>
      <p role="status">{notice}</p>
      <label>
        Review queue
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="review">Matches needing review</option>
          <option value="artwork">Covers awaiting permission</option>
          <option value="unmatched">Unmatched songs</option>
          <option value="failed">Failed jobs</option>
          <option value="queued">Queued jobs</option>
          <option value="enriched">Enriched songs</option>
          <option value="all">All songs</option>
        </select>
      </label>
      <label>
        Find a song or artist
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <details open>
        <summary>Review matches, artwork and failures ({shown.length})</summary>
        {shown.map((job) => (
          <JobReview
            key={
              job.song_id +
              job.status +
              JSON.stringify(job.artwork_permission) +
              job.candidates[0]?.artwork?.imageId
            }
            job={job}
            name={names[job.song_id] ?? job.song_id}
            pending={pending}
            run={run}
          />
        ))}
        {!shown.length ? <p>No songs in this view.</p> : null}
      </details>
    </section>
  );
}
