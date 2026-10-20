"use client";
import { useActionState } from "react";
import { submitRankVote } from "@/app/rank/actions";
import { SongChoice } from "@/components/song-choice";
import { MusicLoading } from "@/components/music-loading";
import type { RankPair, RankSong } from "@/lib/rank";

async function vote(_previous: null, form: FormData) {
  await submitRankVote(form);
  return null;
}

function Choice({ song, pending }: { song: RankSong; pending: boolean }) {
  return (
    <SongChoice song={song}>
      <button
        className="button"
        name="selectedSongId"
        value={song.id}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <MusicLoading compact label="Recording…" />
        ) : (
          `Prefer ${song.title}`
        )}
      </button>
    </SongChoice>
  );
}
export function RankPairCards({ pair }: { pair: RankPair }) {
  const [, action, pending] = useActionState(vote, null);
  return (
    <>
      <form className="matchup" action={action}>
        <input type="hidden" name="comparisonId" value={pair.id} />
        <Choice key={pair.songA.id} song={pair.songA} pending={pending} />
        <div className="versus" aria-hidden="true">
          VS
        </div>
        <Choice key={pair.songB.id} song={pair.songB} pending={pending} />
      </form>
    </>
  );
}
