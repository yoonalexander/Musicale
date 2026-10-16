import { SubmitButton } from "@/components/submit-button";
export const metadata = {
  title: "Your profile",
  description:
    "Your saved votes, UTC participation streak and listening history.",
};
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerState, getProfileData } from "@/lib/data";
import { updateDisplayName } from "@/app/actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const v = await getViewerState();
  if (!v.user) redirect("/login?message=Sign+in+to+view+your+profile");
  const params = await searchParams,
    page = Math.max(1, Math.min(10000, parseInt(params.page ?? "1") || 1));
  const { history, total, stats } = await getProfileData(page),
    p = v.profile;
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">Your listening instinct</p>
        <h1>{p?.displayName ?? "Listener"}</h1>
        <p>Member since {p?.createdAt.slice(0, 10) ?? "today"}</p>
      </header>
      {params.message ? (
        <p className="notice" role="status">
          {params.message}
        </p>
      ) : null}
      <dl className="stats">
        <div>
          <dt>Current streak</dt>
          <dd>{p?.currentStreak ?? 0}</dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>{p?.longestStreak ?? 0}</dd>
        </div>
        <div>
          <dt>Total votes</dt>
          <dd>{p?.totalVotes ?? 0}</dd>
        </div>
      </dl>
      <details className="panel">
        <summary>Edit display name</summary>
        <form action={updateDisplayName} className="admin-form">
          <label>
            Display name
            <input
              name="displayName"
              required
              maxLength={60}
              defaultValue={p?.displayName ?? ""}
              autoComplete="nickname"
            />
          </label>
          <SubmitButton>Save display name</SubmitButton>
        </form>
      </details>
      <section className="panel">
        <h2>Your listening pattern</h2>
        {total >= 5 ? (
          <>
            {stats.sample >= 5 ? (
              <p>
                You chose the majority in {stats.majority}% of {stats.sample}{" "}
                completed matchups with at least five listeners. Ties don’t
                count as majority picks.
              </p>
            ) : (
              <p>
                Agreement and controversial picks appear after five completed
                matchups with at least five listeners each.
              </p>
            )}
            {stats.artists.length ? (
              <>
                <h3>Most selected artists</h3>
                <ul>
                  {stats.artists.map((a) => (
                    <li key={a.label}>
                      {a.label} · {a.count} picks
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {stats.genres.length ? (
              <>
                <h3>Most selected genres</h3>
                <ul>
                  {stats.genres.map((a) => (
                    <li key={a.label}>
                      {a.label} · {a.count} picks
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {stats.picks.length ? (
              <>
                <h3>Songs you return to</h3>
                <ul>
                  {stats.picks.map((s) => (
                    <li key={s.song_id}>
                      <Link href={`/songs/${s.song_id}`}>{s.title}</Link> ·{" "}
                      {s.artist_name} · {s.count} picks
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {stats.sample >= 5 && stats.controversial.length ? (
              <>
                <h3>Your underdog picks</h3>
                <ul>
                  {stats.controversial.map((s) => (
                    <li key={s.matchup_day}>
                      {s.title} · {s.matchup_day} · {s.agreement}% agreed
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p>
              Based on recorded votes. Artists and genres need three picks;
              repeated songs need two. These patterns aren’t a complete music
              preference profile.
            </p>
          </>
        ) : (
          <p>Listening patterns appear after at least five votes.</p>
        )}
      </section>
      <section className="panel">
        <h2>Recent votes</h2>
        {history.length ? (
          <ul className="vote-history">
            {history.map((h) => (
              <li key={h.id}>
                <strong>
                  {h.matchup_day} ·{" "}
                  <Link href={`/songs/${h.selected_song_id}`}>{h.title}</Link>
                </strong>
                <p>
                  {h.artist_name} · Rating moved +{h.rating_delta} ·{" "}
                  {h.agreement}% agree so far
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {total
              ? "No votes on this page."
              : "Vote in your first daily matchup to begin your history."}
          </p>
        )}
        <nav className="pagination" aria-label="Voting history pages">
          {page > 1 ? (
            <Link
              className="button secondary"
              href={`/profile?page=${page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          <span>
            Page {page} · {total} votes
          </span>
          {page * 25 < total ? (
            <Link
              className="button secondary"
              href={`/profile?page=${page + 1}`}
            >
              Next
            </Link>
          ) : null}
        </nav>
      </section>
    </section>
  );
}
