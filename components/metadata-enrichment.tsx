"use client";
import { useEffect, useState, useTransition } from "react";
import {
  metadataProgress,
  enrichNextSong,
  enrichSongMetadata,
  retryMetadata,
  reviewMetadata,
} from "@/app/metadata-actions";
import type { MetadataCandidate } from "@/lib/metadata-enrichment";
type Job = {
  song_id: string;
  status: string;
  attempts: number;
  error: string | null;
  candidates: MetadataCandidate[];
  songs: {
    title: string;
    artist_name: string;
    album_name: string;
    release_year: number;
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
  return (
    <details>
      <summary>
        {name} · {job.status} · {job.attempts} attempts
      </summary>
      <p>
        Current: {job.songs.artist_name} · {job.songs.album_name} ·{" "}
        {job.songs.release_year}.
      </p>
      {job.error ? <p role="alert">{job.error}</p> : null}
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
        Refresh metadata now
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
        setNotice("Metadata work saved.");
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
      (filter === "all" || job.status === filter) &&
      `${names[job.song_id]} ${job.songs.artist_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <h2>Album metadata</h2>
      <p>
        Fill missing fields automatically; review conflicts before changing
        editorial metadata. Match scores are rules, not probabilities.
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
        <summary>Review matches and failures ({shown.length})</summary>
        {shown.map((job) => (
          <JobReview
            key={job.song_id + job.status}
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
