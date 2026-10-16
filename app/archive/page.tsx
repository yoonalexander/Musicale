export const metadata = {
  title: "Featured matchups",
  description:
    "Explore genuine completed Musicale matchups, final community votes and song histories.",
};
import Link from "next/link";
import { getFeaturedMatchups } from "@/lib/data";
export default async function Archive() {
  const matchups = await getFeaturedMatchups();
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">The editorial collection</p>
        <h1>Memorable matchups</h1>
        <p>Featured choices from completed Musicale days.</p>
      </header>
      {matchups.length ? (
        matchups.map((m) => (
          <article className="panel" key={m.matchup_day}>
            <p className="kicker">
              #{m.matchup_number} · {m.matchup_day}
            </p>
            <h2>
              <Link href={`/songs/${m.song_a_id}`}>{m.song_a_title}</Link> vs{" "}
              <Link href={`/songs/${m.song_b_id}`}>{m.song_b_title}</Link>
            </h2>
            <p>
              {m.song_a_votes}–{m.song_b_votes} ·{" "}
              {m.song_a_votes + m.song_b_votes} listeners
            </p>
          </article>
        ))
      ) : (
        <p>
          No featured matchups yet. An editor can feature a genuine completed
          day once voting closes. Explore today’s songs or the catalog while you
          wait.
        </p>
      )}
      <Link className="button" href="/today">
        Play today
      </Link>
    </section>
  );
}
