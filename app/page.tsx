import Link from "next/link";
import { getLeaderboard, isDemoMode } from "@/lib/data";
export default async function Home() {
  const top = (await getLeaderboard()).songs.slice(0, 3);
  const initial = top.every((s) => s.matchupCount === 0);
  return (
    <>
      <section className="hero">
        <p className="kicker">Three ways to follow your music instinct</p>
        <h1>
          Know music.
          <br />
          Trust your ears.
          <br />
          <em>Beat your score.</em>
        </h1>
        <p>
          Guess which song is higher rated, rank your favorites, or return for
          the daily vote.
        </p>
        <div className="actions">
          <Link className="button" href="/play">
            Play higher rated
          </Link>
          <Link className="button secondary" href="/rank">
            Rank music
          </Link>
        </div>
      </section>
      <section className="page onboarding" aria-labelledby="how-it-works">
        <h2 id="how-it-works">Three ways to play.</h2>
        <ol>
          <li>
            <strong>Play</strong>
            <p>
              Guess the higher Elo rating. Correct answers earn a point and
              randomly replace one song. A wrong guess ends your saved run.
            </p>
          </li>
          <li>
            <strong>Rank</strong>
            <p>
              Choose the song you prefer. Two new songs follow each saved
              preference, building the shared Elo leaderboard.
            </p>
          </li>
          <li>
            <strong>Daily</strong>
            <p>
              Sign in with an email link and vote once in the shared matchup.
              Return on consecutive UTC days to build your streak. The next day
              starts at midnight UTC.
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
        <Link href="/today">Visit Daily</Link>
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
