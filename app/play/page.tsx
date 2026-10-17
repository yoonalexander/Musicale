import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getPlayState, getPlayPair, roundIdPattern } from "@/lib/play";
import { PlayPair, PlayResult } from "@/components/play-pair";
import { HowToPlay } from "@/components/how-to-play";
import { GuestForm } from "@/components/guest-form";
import { SubmitButton } from "@/components/submit-button";
import { startPlay } from "./actions";
export const metadata = {
  title: "Play higher rated",
  description:
    "Two songs. One good instinct. Guess the higher community rating and keep your run going. No sign-up needed.",
};

export default async function Play({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [viewer, params] = await Promise.all([getViewerState(), searchParams]);
  const state =
    viewer.user && !isDemoMode()
      ? await getPlayState(
          params.answered && roundIdPattern.test(params.answered)
            ? params.answered
            : undefined,
        )
      : null;
  const pair = state?.round ? await getPlayPair(state.round) : null;
  const paused =
    state?.run.status === "paused" || (state?.run.status === "active" && !pair);
  const Form = viewer.user ? "form" : GuestForm;
  return (
    <section className="today game-stage play-stage">
      <div className="play-toolbar">
        <p className="kicker">
          Play <span>Unlimited runs</span>
        </p>
        <HowToPlay autoOpen={Boolean(pair)} />
      </div>
      <header className="game-question">
        <h1>Which song is higher rated?</h1>
        <p>Trust your instinct. Choose one.</p>
      </header>
      {params.error ? (
        <p className="notice" role="alert">
          {params.error}
        </p>
      ) : null}
      {state ? (
        <p className="play-score">
          <span aria-label="Run score">
            Run score: <strong>{state.run.score}</strong>
          </span>
          <span className="play-round-number">
            {state.round
              ? `Round ${state.round.number}`
              : state.run.status === "ended"
                ? "Final score"
                : "Points preserved"}
          </span>
        </p>
      ) : null}
      {state?.answer ? (
        <PlayResult
          answer={state.answer}
          earlier={state.answer.runId !== state.run.id}
        />
      ) : null}
      {isDemoMode() ? (
        <section className="panel">
          <h2>Explore the music.</h2>
          <p>Preview mode — guest play and saved runs are disabled.</p>
          <Link className="button" href="/leaderboard">
            Browse the catalog
          </Link>
        </section>
      ) : pair ? (
        <>
          <PlayPair key={pair.id} pair={pair} />
          <p className="round-expiry">
            Ratings are locked for this round. Choose before{" "}
            <time dateTime={pair.expiresAt}>
              {new Date(pair.expiresAt).toISOString().slice(11, 16)} UTC
            </time>
            . Expiry preserves your points.
          </p>
        </>
      ) : (
        <section className="panel play-ready">
          <h2>
            {paused
              ? "Run paused"
              : state
                ? "Ready for another run?"
                : "Ready to play?"}
          </h2>
          <p>
            {paused
              ? state?.run.reason === "expired"
                ? "Your round expired. Your points are preserved. Resume with the same two songs and fresh rating snapshots."
                : state?.run.reason === "unavailable"
                  ? "A song is temporarily unavailable. Your points are preserved. Resume when listening is available again."
                  : "No eligible untied pair is available for this run. Your points are preserved. Help build ratings in Rank, then resume."
              : "Two songs. Pick the higher rating. A correct guess earns one point; a wrong guess ends your run."}
          </p>
          <div className="actions">
            <Form action={startPlay}>
              <SubmitButton busyText="Getting your songs…">
                {paused
                  ? "Resume run"
                  : state
                    ? "Start a new run"
                    : "Start a run"}
              </SubmitButton>
            </Form>
            {paused && state ? (
              <form action={startPlay}>
                <input type="hidden" name="restartRunId" value={state.run.id} />
                <SubmitButton
                  className="button secondary"
                  busyText="Preparing…"
                >
                  End this run and start over
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </section>
      )}
      {!viewer.user || viewer.user.isAnonymous ? (
        <p className="guest-note">
          No account needed. <Link href="/login">Sign in</Link> for your history
          and account details.
        </p>
      ) : null}
      <p className="mode-switch">
        <Link href="/rank">Rank music</Link>
        <span aria-hidden="true">·</span>
        <Link href="/today">Visit Daily</Link>
        <span aria-hidden="true">·</span>
        <Link href="/leaderboard">Leaderboard</Link>
      </p>
    </section>
  );
}
