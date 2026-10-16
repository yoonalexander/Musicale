"use client";
import { useFormStatus } from "react-dom";
import { submitRankVote } from "@/app/rank/actions";
import { SongListening } from "@/components/song-listening";
import { ArtworkCredit } from "@/components/artwork-credit";
import type { RankPair, RankSong } from "@/lib/rank";

function Choice({ song }: { song: RankSong }) {
  const { pending } = useFormStatus();
  return (
    <article className="song-choice">
      <div className="art">
        {song.artworkUrl ? (
          <img
            src={song.artworkUrl}
            alt={`${song.title} artwork`}
            width="600"
            height="600"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden="true">{song.title[0]}</span>
        )}
      </div>
      <p className="kicker">
        {song.albumName} · {song.releaseYear}
        {song.genre ? ` · ${song.genre}` : ""}
      </p>
      <h2>{song.title}</h2>
      <p>{song.artistName}</p>
      <ArtworkCredit song={song} />
      <div className="card-actions">
        <SongListening song={song} />
        <button
          className="button"
          name="selectedSongId"
          value={song.id}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Recording…" : `Prefer ${song.title}`}
        </button>
      </div>
    </article>
  );
}
export function RankPairCards({ pair }: { pair: RankPair }) {
  return (
    <>
      <form className="matchup" action={submitRankVote}>
        <input type="hidden" name="comparisonId" value={pair.id} />
        <Choice key={pair.songA.id} song={pair.songA} />
        <div className="versus" aria-hidden="true">
          VS
        </div>
        <Choice key={pair.songB.id} song={pair.songB} />
      </form>
      <p>
        This pair expires at{" "}
        <time dateTime={pair.expiresAt}>
          {new Date(pair.expiresAt).toISOString().slice(11, 16)} UTC
        </time>
        . If it expires, request a new pair. Saved preferences stay in your
        history.
      </p>
    </>
  );
}
