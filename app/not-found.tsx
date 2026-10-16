import Link from "next/link";
export default function NotFound() {
  return (
    <section className="empty">
      <p className="kicker">404 · Lost track</p>
      <h1>This page isn’t in the catalog.</h1>
      <p>The link may be outdated, or the song is no longer available.</p>
      <div className="actions">
        <Link className="button" href="/leaderboard">
          Browse the catalog
        </Link>
        <Link className="button secondary" href="/today">
          Visit Daily
        </Link>
      </div>
    </section>
  );
}
