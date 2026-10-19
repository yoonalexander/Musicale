import { notFound } from "next/navigation";
import { getSong, getSongHistory } from "@/lib/data";
import { SongListening } from "@/components/song-listening";
import { RatingHistory } from "@/components/rating-history";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const data = await getSong((await params).id);
  if (!data) notFound();
  return {
    title: data.song.title + " · " + data.song.artistName,
    description:
      "Explore " +
      data.song.title +
      " by " +
      data.song.artistName +
      ": official listening links, recorded votes and Elo history.",
  };
}
export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getSong(id);
  if (!data) notFound();
  const { song, rank } = data;
  const history = await getSongHistory(id);
  return (
    <section className="song-detail">
      <div>
        <p className="kicker">
          {song.status !== "active"
            ? "Currently unavailable"
            : song.matchupCount === 0
              ? "Not ranked yet"
              : `Catalog position #${rank}`}{" "}
          · {song.genre ?? "Music"}
        </p>
        <h1>{song.title}</h1>
        <p className="subtitle">
          {song.artistName} · {song.albumName} ·{" "}
          {song.releaseDate ?? song.releaseYear}
          {song.durationMs
            ? ` · ${Math.floor(song.durationMs / 60000)}:${String(Math.floor(song.durationMs / 1000) % 60).padStart(2, "0")}`
            : ""}
        </p>
        {song.metadataDetails ? (
          <p>
            Original recording release:{" "}
            {song.metadataDetails.originalDate ?? "Unknown"} · Album edition:{" "}
            {song.metadataDetails.albumDate ?? "Unknown"}.{" "}
            <a
              href={`https://musicbrainz.org/recording/${song.metadataDetails.recordingId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              MusicBrainz metadata
            </a>
          </p>
        ) : null}
        <div className="actions">
          <SongListening song={song} />
        </div>
        <dl className="stats">
          <div>
            <dt>Elo</dt>
            <dd>{Math.round(song.eloRating)}</dd>
          </div>
          <div>
            <dt>Record</dt>
            <dd>
              {song.wins}–{song.losses}
            </dd>
          </div>
          <div>
            <dt>Win rate</dt>
            <dd>
              {song.matchupCount
                ? Math.round((song.wins / song.matchupCount) * 100)
                : 0}
              %
            </dd>
          </div>
          <div>
            <dt>Total votes</dt>
            <dd>{song.matchupCount}</dd>
          </div>
        </dl>
        <p>
          {song.matchupCount === 0
            ? "Starting rating: this song has no recorded votes yet."
            : song.matchupCount < 5
              ? "Provisional rating: fewer than five recorded votes."
              : "Based on recorded community votes."}{" "}
          Equal Elo ratings are tied; catalog order breaks display ties.
        </p>
        <RatingHistory snapshots={history.snapshots} />
        <section className="panel">
          <h2>Recent daily matchups</h2>
          {history.matchups.length ? (
            <ul>
              {history.matchups.map((m) => (
                <li key={m.matchup_day}>
                  {m.matchup_day}: {m.song_a_title} ({m.song_a_votes}) vs{" "}
                  {m.song_b_title} ({m.song_b_votes})
                </li>
              ))}
            </ul>
          ) : (
            <p>Completed daily matchups will appear here.</p>
          )}
        </section>
      </div>
    </section>
  );
}
