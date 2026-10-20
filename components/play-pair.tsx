"use client";
import { useActionState, useEffect, useRef } from "react";
import { submitPlayGuess } from "@/app/play/actions";
import { SongChoice } from "@/components/song-choice";
import { NewPlayButton } from "@/components/play-session";
import { MusicLoading } from "@/components/music-loading";
import type { RankPair, RankSong } from "@/lib/rank";
import type { PlayState } from "@/lib/play";

async function guess(_previous: null, form: FormData) {
  await submitPlayGuess(form);
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
        aria-label={`Higher: ${song.title}`}
      >
        {pending ? (
          <MusicLoading compact label="Checking…" />
        ) : (
          "Higher rated ↑"
        )}
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
  const [, action, pending] = useActionState(guess, null);
  return (
    <form className="matchup" action={action}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="roundId" value={pair.id} />
      <Choice key={pair.songA.id} song={pair.songA} pending={pending} />
      <div className="versus" aria-hidden="true">
        VS
      </div>
      <Choice key={pair.songB.id} song={pair.songB} pending={pending} />
    </form>
  );
}
export function PlayResult({
  answer,
}: {
  answer: NonNullable<PlayState["answer"]>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [answer.id]);
  if (!answer.correct) {
    const songs = [
      { title: answer.titleA, rating: answer.ratingA },
      { title: answer.titleB, rating: answer.ratingB },
    ];
    const higherRating = Math.max(answer.ratingA, answer.ratingB);
    return (
      <section className="panel play-loss" aria-label="Saved answer">
        <header>
          <h2 ref={heading} tabIndex={-1}>
            Run complete
          </h2>
          <p role="status">Your pick had the lower rating.</p>
        </header>
        <div className="play-loss-songs">
          {songs.map((song, index) => {
            const higher = song.rating === higherRating;
            return (
              <div
                className={`play-loss-song${higher ? " is-higher" : ""}`}
                key={index}
              >
                <p className="play-loss-label">
                  {higher ? "Higher rated" : "Your pick"}
                </p>
                <h3>{song.title}</h3>
                <p className="play-loss-rating">
                  <strong>{song.rating}</strong> Elo
                </p>
              </div>
            );
          })}
        </div>
        <p className="play-loss-caption">Ratings at the start of this round.</p>
        <NewPlayButton>
          Play again <span aria-hidden="true">→</span>
        </NewPlayButton>
      </section>
    );
  }
  const higherRating = Math.max(answer.ratingA, answer.ratingB);
  return (
    <section className="panel play-result" aria-label="Saved answer">
      <header className="play-result-header">
        <h2 ref={heading} tabIndex={-1}>
          <span className="play-result-check" aria-hidden="true">
            ✓
          </span>
          Correct!
        </h2>
        <p className="play-result-points" role="status">
          +1 point
        </p>
      </header>
      <div className="play-result-ratings">
        {[
          { title: answer.titleA, rating: answer.ratingA },
          { title: answer.titleB, rating: answer.ratingB },
        ].map((song, index) => (
          <div className="play-result-song" key={index}>
            <div>
              <p className="play-result-label">
                {song.rating === higherRating
                  ? "Your pick · Higher rated"
                  : "Other song"}
              </p>
              <h3>{song.title}</h3>
            </div>
            <p className="play-result-rating">
              <strong>{song.rating}</strong> Elo
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
