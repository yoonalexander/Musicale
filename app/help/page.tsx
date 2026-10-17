import Link from "next/link";
import audioCredits from "@/data/audio-provenance.json";
export const metadata = {
  title: "Help and contact",
  description:
    "Get help with Musicale sign-in, daily votes, UTC streaks and unavailable recordings.",
};
export default function Help() {
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">A little help</p>
        <h1>Keep the music going.</h1>
        <p>
          Musicale builds music rankings through Rank and Daily preferences.
          Here’s how to get unstuck.
        </p>
      </header>
      <section className="panel">
        <h2>Play without signing up</h2>
        <p>
          Play, Rank and Daily work as a guest. Your browser keeps a private
          session so you can return to your run and avoid repeating a Daily
          vote. Clearing cookies or changing browsers loses access to that guest
          session. Sign in for your full history and account details. A verified
          new email keeps your guest activity; signing into an existing account
          loads that account’s history without automatically merging guest
          activity.
        </p>
        <h2>Signing in</h2>
        <p>
          Request a fresh email link and open the newest link in the browser
          where you requested it. Check spam and wait a minute before retrying.
          A link can only be used once.
        </p>
        <Link className="button secondary" href="/login">
          Request a sign-in link
        </Link>
        <h2>Daily votes and streaks</h2>
        <p>
          You can save one vote per account per UTC day. A saved choice cannot
          be changed. Voting on consecutive UTC days builds your streak; missing
          a day resets it. Your history stays saved.
        </p>
        <h2>Play higher rated</h2>
        <p>
          In <Link href="/play">Play</Link>, guess the higher Elo rating
          captured when the round was issued. A correct guess earns one point
          and randomly replaces either card with a different song. A wrong guess
          ends your run. Ties and songs without a recorded Daily or Rank
          preference are excluded. Runs are saved to your guest session or
          account; refreshing resumes your round. After thirty minutes, resume
          with the same songs and fresh ratings. Expiry, unavailable listening,
          or too few eligible songs pause your run and preserve points. Rank
          more songs to help make new pairs available. Thirty Play requests per
          minute protect against accidental repeats. Play never changes Elo or
          Daily streaks.
        </p>
        <h2>Continuous Rank</h2>
        <p>
          In <Link href="/rank">Rank</Link>, choose the song you prefer and both
          cards change. Rank shares Daily’s Elo leaderboard, with its own
          Profile history and no effect on Daily totals or streaks. A pending
          pair resumes on refresh and expires after thirty minutes. The same
          pair has a ten-minute cooldown; at least four playable songs are
          needed. Thirty Rank requests per minute protect against accidental
          repeats and automated voting.
        </p>
        <h2>Listening and availability</h2>
        <p>
          Official listening links open in a new tab. Reviewed, authorized audio
          sources play here through a custom 15-second player. Pause, seek
          within the excerpt or replay it; starting another song pauses the
          first. Rank’s Listen and rank option selects songs with authorized
          previews. Musicale serves four attributed CC BY excerpts; commercial
          tracks retain their official links until licensed. If today has no
          playable pair, browse the catalog or return after the next midnight
          UTC reset.
        </p>
      </section>
      <section className="panel">
        <h2>Contact and report a problem</h2>
        <p>
          <a
            href="https://github.com/yoonalexander/musicale/issues/new"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open a Musicale support issue on GitHub
          </a>
          . Include the page, your browser and what went wrong. Never post
          sign-in links, passwords or private account details.
        </p>
        <p>
          GitHub requires an account. For a private account or data request, use
          the project owner’s contact information on{" "}
          <a
            href="https://alexyoon.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            alexyoon.com
          </a>
          .
        </p>
      </section>
      <section id="music-credits" className="panel">
        <h2>Music credits and licenses</h2>
        <p>
          Our four open-license previews are arrangements/performances by Kevin
          MacLeod (incompetech.com), licensed under Creative Commons Attribution
          3.0 Unported. The Gymnopedies were composed by Erik Satie; Hall of the
          Mountain King by Edvard Grieg. No endorsement is implied. These audio
          licenses are independent of Musicale’s code license and do not
          authorize other recordings. The excerpts are supplied as-is, without
          warranties.
        </p>
        <ul>
          {audioCredits.map((credit) => (
            <li key={credit.songId}>
              <strong>{credit.title}</strong> — Kevin MacLeod. {credit.changes}.{" "}
              <a
                href={credit.authorization}
                target="_blank"
                rel="noopener noreferrer"
              >
                Original recording and permission
              </a>{" "}
              ·{" "}
              <a
                href={credit.license}
                target="_blank"
                rel="noopener noreferrer"
              >
                CC BY 3.0 license
              </a>
              .
            </li>
          ))}
        </ul>
      </section>
      <Link className="button" href="/today">
        Visit Daily
      </Link>
    </section>
  );
}
