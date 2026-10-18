"use client";
import { useFormStatus } from "react-dom";
import { useEffect, useRef } from "react";
import { submitPlayGuess } from "@/app/play/actions";
import { SongChoice } from "@/components/song-choice";
import type { RankPair, RankSong } from "@/lib/rank";
import type { PlayState } from "@/lib/play";

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
        aria-label={`Higher: ${song.title}`}
      >
        {pending ? "Checking…" : "Higher rated ↑"}
      </button>
    </SongChoice>
  );
}
export function PlayPair({
  pair,
  returnTo,
}: {
  pair: RankPair;
  returnTo: "/" | "/play";
}) {
  return (
    <form className="matchup" action={submitPlayGuess}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="roundId" value={pair.id} />
      <Choice key={pair.songA.id} song={pair.songA} />
      <div className="versus" aria-hidden="true">
        VS
      </div>
      <Choice key={pair.songB.id} song={pair.songB} />
    </form>
  );
}
export function PlayResult({
  answer,
  earlier,
}: {
  answer: NonNullable<PlayState["answer"]>;
  earlier: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [answer.id]);
  return (
    <section className="panel play-result" aria-label="Saved answer">
      <h2 ref={heading} tabIndex={-1}>
        {earlier
          ? "Earlier saved answer"
          : answer.correct
            ? "Correct!"
            : "Run complete"}
      </h2>
      <p role="status">
        {answer.correct
          ? "Correct guess. One point earned."
          : "That was the lower-rated song. Your run has ended."}{" "}
        Score after this answer: {answer.scoreAfter}.
      </p>
      <p>
        {answer.titleA}: {answer.ratingA} Elo · {answer.titleB}:{" "}
        {answer.ratingB} Elo. These were the ratings captured for that round.
      </p>
    </section>
  );
}
