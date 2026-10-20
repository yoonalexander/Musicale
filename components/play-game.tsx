import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getPlayState, getPlayPair, roundIdPattern } from "@/lib/play";
import { PlayPair, PlayResult } from "@/components/play-pair";
import { HowToPlay } from "@/components/how-to-play";
import { PlaySession, NewPlayButton } from "@/components/play-session";
export async function PlayGame({
  searchParams,
  returnTo = "/play",
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  returnTo?: "/" | "/play";
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
  const unavailable =
    state?.run.status === "paused" || (state?.run.status === "active" && !pair);
  const emptyRun =
    !pair && state?.run.score === 0 && state.run.reason === "insufficient";
  const Session = isDemoMode() ? PassThrough : PlaySession;
  return (
    <Session runId={state?.run.id}>
      <section className="today game-stage play-stage">
        <div className="play-toolbar">
          <p className="kicker">Play</p>
          <HowToPlay autoOpen={Boolean(pair)} />
        </div>
        <header className="game-question">
          <h1>Which song is higher rated?</h1>
        </header>
        {params.error ? (
          <p className="notice" role="alert">
            {params.error}
          </p>
        ) : null}
        {state && !emptyRun ? (
          <p className="play-score">
            <span aria-label="Run score">
              Run score: <strong>{state.run.score}</strong>
            </span>
            <span className="play-round-number">
              {state.round
                ? `Round ${state.round.number}`
                : state.run.status === "ended"
                  ? "Final score"
                  : "Final score"}
            </span>
          </p>
        ) : null}
        {state?.answer && state.answer.runId === state.run.id ? (
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
          <PlayPair key={pair.id} pair={pair} returnTo={returnTo} />
        ) : (
          <section className="panel play-ready">
            <h2>
              {unavailable || emptyRun
                ? emptyRun
                  ? "No matchup available right now"
                  : "Run complete"
                : state
                  ? "Ready for another run?"
                  : "Ready to play?"}
            </h2>
            <p>
              {unavailable || emptyRun
                ? emptyRun
                  ? "More songs need community ratings before another matchup is available. Try again shortly."
                  : "This run has ended. Start a new run with a fresh pair of songs."
                : "Two songs. Pick the higher rating. A correct guess earns one point; a wrong guess ends your run."}
            </p>
            <div className="actions">
              <NewPlayButton>
                {emptyRun ? "Try again" : "Start a new run"}
              </NewPlayButton>
            </div>
          </section>
        )}
        {!viewer.user || viewer.user.isAnonymous ? (
          <p className="guest-note">
            No account needed. <Link href="/login">Sign in</Link> for your
            history and account details.
          </p>
        ) : null}
      </section>
    </Session>
  );
}

function PassThrough({
  children,
}: {
  children: React.ReactNode;
  runId?: string;
}) {
  return children;
}
