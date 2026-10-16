import { getSiteUrl } from "@/lib/env";
export const metadata = {
  title: "Today’s matchup",
  description:
    "Listen to today’s two songs, sign in and save one vote before midnight UTC.",
};
import Link from "next/link";
import { DailyMatchup } from "@/components/daily-matchup";
import { getTodayMatchup, getViewerState, isDemoMode } from "@/lib/data";
export default async function Today({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [m, v, p] = await Promise.all([
    getTodayMatchup(),
    getViewerState(),
    searchParams,
  ]);
  if (!m)
    return (
      <section className="empty">
        <h1>No matchup is available today.</h1>
        <p>A new pair hasn’t been scheduled, or its songs are unavailable.</p>
        <p>
          Daily voting follows midnight UTC. Explore the music while you wait.
        </p>
        <div className="actions">
          <Link className="button" href="/leaderboard">
            Browse the catalog
          </Link>
          <Link className="button secondary" href="/archive">
            View past matchups
          </Link>
        </div>
      </section>
    );
  return (
    <section className="today">
      <header>
        <p className="kicker">
          Musicale #{m.number} · {m.matchupDay}
        </p>
        <h1>Which song stays with you?</h1>
        <p>
          Listen on an official provider, then choose one song. One saved vote
          per account, per UTC day.
        </p>
        <p>
          {m.songA.genre ?? "Music"} meets {m.songB.genre ?? "music"}:{" "}
          {m.songA.artistName} ({m.songA.releaseYear}) and {m.songB.artistName}{" "}
          ({m.songB.releaseYear}).
        </p>
        {p.error ? (
          <p className="notice" role="alert">
            {p.error}
          </p>
        ) : null}
        {!v.user ? (
          <p className="notice">
            <Link href="/login">Sign in</Link> to record your vote.
          </p>
        ) : null}
        {isDemoMode() ? (
          <p className="notice">
            Preview mode — accounts and persistent voting are disabled.
          </p>
        ) : null}
      </header>
      <DailyMatchup
        siteUrl={getSiteUrl()}
        matchup={m}
        canVote={Boolean(v.user) && !isDemoMode()}
        streak={v.profile?.currentStreak ?? 0}
      />
    </section>
  );
}
