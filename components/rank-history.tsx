import Link from "next/link";
import { getRankHistory } from "@/lib/rank";
export async function RankHistory({
  page,
  dailyPage,
}: {
  page: number;
  dailyPage: number;
}) {
  const { total, history } = await getRankHistory(page);
  return (
    <section className="panel">
      <h2>Rank preferences</h2>
      <p>
        {total} continuous preferences. Daily totals and streaks are shown
        separately above.
      </p>
      {history.length ? (
        <ul className="vote-history">
          {history.map((h) => (
            <li key={h.id}>
              <strong>
                <Link href={`/songs/${h.selectedId}`}>{h.selected.title}</Link>{" "}
                over{" "}
                <Link href={`/songs/${h.rejectedId}`}>{h.rejected.title}</Link>
              </strong>
              <p>
                {h.createdAt.slice(0, 10)} · {h.selected.artist_name} · Elo
                moved +{h.delta}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {total
            ? "No Rank preferences on this page."
            : "Choose your first pair in Rank to begin this history."}
        </p>
      )}
      <nav className="pagination" aria-label="Rank history pages">
        {page > 1 ? (
          <Link
            className="button secondary"
            href={`/profile?page=${dailyPage}&rankPage=${page - 1}`}
          >
            Previous Rank preferences
          </Link>
        ) : null}
        <span>
          Page {page} · {total} Rank preferences
        </span>
        {page * 25 < total ? (
          <Link
            className="button secondary"
            href={`/profile?page=${dailyPage}&rankPage=${page + 1}`}
          >
            Next Rank preferences
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
