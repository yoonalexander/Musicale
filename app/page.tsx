import Link from "next/link";
import { getLeaderboard, isDemoMode } from "@/lib/data";
export default async function Home() {
  const top = (await getLeaderboard()).songs.slice(0, 3);
  const initial = top.every((s) => s.matchupCount === 0);
  return (
    <>
      <section className="hero">
        <p className="kicker">The daily music vote</p>
        <h1>
          Every day.
          <br />
          Two songs.
          <br />
          <em>One choice.</em>
        </h1>
        <p>
          Listen to today’s matchup, vote for your favorite, and help build the
          global song leaderboard.
        </p>
        <div className="actions">
          <Link className="button" href="/today">
            Play today
          </Link>
          <Link className="button secondary" href="/leaderboard">
            View leaderboard
          </Link>
        </div>
      </section>
      <section className="page onboarding" aria-labelledby="how-it-works">
        <h2 id="how-it-works">One daily listening habit.</h2>
        <ol>
          <li>
            <strong>Listen</strong>
            <p>
              Everyone gets the same two songs. Open their official provider
              links and listen at your own pace.
            </p>
          </li>
          <li>
            <strong>Choose</strong>
            <p>
              Sign in with an email link and vote once. Your saved choice cannot
              be changed that day.
            </p>
          </li>
          <li>
            <strong>Return</strong>
            <p>
              See community results and build your streak on consecutive UTC
              days. The next day starts at midnight UTC.
            </p>
          </li>
        </ol>
        <h2>How the rankings work</h2>
        <p>
          Every song starts at 1500 Elo. Winning against a higher-rated opponent
          usually earns more points. Ratings under five votes are provisional;
          equal ratings are ties, not a preference for one song.
        </p>
      </section>
      <section className="strip">
        <Link href="/rank">Keep comparing songs in Rank</Link>
        <span>One shared matchup</span>
        <span>Resets at midnight UTC</span>
        <span>Results hidden until you vote</span>
      </section>
      <section className="home-board">
        <div>
          <p className="kicker">The signal so far</p>
          <h2>
            {isDemoMode() || initial
              ? "Meet the catalog."
              : "The leaderboard so far."}
          </h2>
        </div>
        <ol>
          {top.map((s, i) => (
            <li key={s.id}>
              <span>{s.matchupCount ? `0${i + 1}` : "—"}</span>
              <div>
                <strong>
                  <Link href={`/songs/${s.id}`}>{s.title}</Link>
                </strong>
                <small>{s.artistName}</small>
              </div>
              <b>
                {Math.round(s.eloRating)}
                <small>
                  {s.matchupCount === 0
                    ? "Initial rating"
                    : s.matchupCount < 5
                      ? "Provisional"
                      : "Elo"}
                </small>
              </b>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
