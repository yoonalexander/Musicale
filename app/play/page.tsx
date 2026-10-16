import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getPlayState, getPlayPair, roundIdPattern } from "@/lib/play";
import { PlayPair, PlayResult } from "@/components/play-pair";
import { SubmitButton } from "@/components/submit-button";
import { startPlay } from "./actions";
export const metadata = {
  title: "Play higher rated",
  description:
    "Guess which song has the higher community Elo rating. Earn a point, keep one song, and keep your run going.",
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
  return (
    <section className="today">
      <header>
        <p className="kicker">Play · Higher or lower</p>
        <h1>Which song is higher rated?</h1>
        <p>
          Guess the higher community Elo rating. A correct guess earns one point
          and randomly replaces either song. A wrong guess ends your run.
        </p>
        <p>
          Each round uses fixed ratings captured when it starts. Play points
          stay separate from song rankings and your Daily streak.
        </p>
        {params.error ? (
          <p className="notice" role="alert">
            {params.error}
          </p>
        ) : null}
        {state ? (
          <p className="notice" aria-label="Run score">
            Run score: <strong>{state.run.score}</strong>
          </p>
        ) : null}
      </header>
      {state?.answer ? (
        <PlayResult
          answer={state.answer}
          earlier={state.answer.runId !== state.run.id}
        />
      ) : null}
      {!viewer.user ? (
        <section className="panel">
          <p>
            {isDemoMode()
              ? "Preview mode — sign-in and saved Play runs are disabled."
              : "Sign in to start a run and resume it across visits."}
          </p>
          <Link
            className="button"
            href={isDemoMode() ? "/leaderboard" : "/login"}
          >
            {isDemoMode() ? "Browse the catalog" : "Sign in"}
          </Link>
        </section>
      ) : pair ? (
        <>
          <p>
            Round {state!.round!.number}. Choose before{" "}
            <time dateTime={pair.expiresAt}>
              {new Date(pair.expiresAt).toISOString().slice(11, 16)} UTC
            </time>
            . Expiry preserves your points; resume to refresh these two songs’
            ratings.
          </p>
          <PlayPair key={pair.id} pair={pair} />
        </>
      ) : (
        <section className="panel">
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
              : "Songs need a recorded Daily or Rank preference and different ratings. Your saved run resumes when you return."}
          </p>
          <form action={startPlay}>
            <SubmitButton busyText="Preparing…">
              {paused
                ? "Resume run"
                : state
                  ? "Start a new run"
                  : "Start a run"}
            </SubmitButton>
          </form>
          {paused && state ? (
            <form action={startPlay}>
              <input type="hidden" name="restartRunId" value={state.run.id} />
              <SubmitButton className="button secondary" busyText="Preparing…">
                End this run and start over
              </SubmitButton>
            </form>
          ) : null}
        </section>
      )}
      <p>
        <Link href="/rank">Rank music</Link> to contribute preferences,{" "}
        <Link href="/today">visit Daily</Link> for the shared UTC matchup, or{" "}
        <Link href="/help">read the rules</Link>.
      </p>
    </section>
  );
}
