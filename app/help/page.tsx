import Link from "next/link";

export const metadata = {
  title: "Help and contact",
  description: "Get help with Musicale Play, ranking, sign-in and listening.",
};

export default function Help() {
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">A little help</p>
        <h1>Keep the music going.</h1>
        <p>Play with your music instinct. Shape the leaderboard in Rank.</p>
      </header>
      <section className="panel">
        <h2>Play without signing up</h2>
        <p>
          Play and Rank work as a guest. Your browser keeps a private session so
          you can return to your run. Clearing cookies or changing browsers
          loses access to that session. Sign in for your history and account
          details. A verified new email keeps your guest activity; signing into
          an existing account loads that account’s history without merging guest
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
        <h2>Play higher rated</h2>
        <p>
          In <Link href="/">Play</Link>, guess the higher community rating. A
          correct guess earns one point and replaces either card with a
          different song. A wrong guess ends your run. Each round locks its
          answer when it starts. Ties and songs without a recorded preference
          are excluded. Each visit or reload starts a fresh run. Closing the tab
          ends that visit; previous runs cannot be resumed. Play does not change
          song ratings.
        </p>
        <h2>How ranking works</h2>
        <p>
          Open <Link href="/rank">Rank</Link> to get two songs automatically.
          Listen, then choose your favorite. Your vote updates both songs’ Elo
          ratings and loads a new pair. Your preferences stay saved to your
          guest session or account. Sign in to view your preference history.
        </p>
        <h2>Listening and availability</h2>
        <p>
          Listen using the YouTube players or open an official listening link in
          a new tab. Starting one player pauses the other. You can change
          whether YouTube players load automatically in{" "}
          <Link href="/privacy">Privacy</Link>. If a player is unavailable, try
          its listening link.
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
          Music plays through YouTube or official provider links. Recordings
          belong to their respective artists and rights holders. Musicale does
          not host these full recordings or claim ownership of them.
        </p>
      </section>
    </section>
  );
}
