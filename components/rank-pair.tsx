"use client";
import { useFormStatus } from "react-dom";
import { submitRankVote } from "@/app/rank/actions";
import { SongChoice } from "@/components/song-choice";
import type { RankPair, RankSong } from "@/lib/rank";

function Choice({ song }: { song: RankSong }) {
  const { pending } = useFormStatus();
  return (
    <SongChoice song={song}>
      <button
        className="button"
        name="selectedSongId"
        value={song.id}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Recording…" : `Prefer ${song.title}`}
      </button>
    </SongChoice>
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
