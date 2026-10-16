import Link from "next/link";
import { getLeaderboard, isDemoMode } from "@/lib/data";
import { leaderboardQuery } from "@/lib/leaderboard-query";
import { LiveLeaderboard } from "@/components/live-leaderboard";
export default async function Leaderboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { page, sort, minimum, filters } = leaderboardQuery(await searchParams);
  const { genre, artist } = filters;
  const initial = await getLeaderboard(page, sort, minimum, filters);
  const query = new URLSearchParams({
    sort,
    minimum: String(minimum),
    genre,
    artist,
    year: filters.year ? String(filters.year) : "",
    decade: filters.decade ? String(filters.decade) : "",
  });
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">Global ranking</p>
        <h1>The leaderboard</h1>
        <p>
          Elo rewards proven performance. Songs under five votes are marked
          provisional.
        </p>
      </header>
      {isDemoMode() ? (
        <p className="notice">
          Preview catalog — these songs have no recorded votes.
        </p>
      ) : null}
      <form className="leader-filters">
        <label>
          Sort by
          <select name="sort" defaultValue={sort}>
            <option value="rating">Elo rating</option>
            <option value="wins">Win percentage</option>
            <option value="votes">Total votes</option>
            <option value="movement">Rating movement · 7 days</option>
          </select>
        </label>
        <label>
          Minimum votes
          <input
            name="minimum"
            type="number"
            min="0"
            max="100000"
            defaultValue={minimum}
          />
        </label>
        <label>
          Genre
          <input
            name="genre"
            maxLength={100}
            defaultValue={genre}
            placeholder="e.g. Soul"
          />
        </label>
        <label>
          Artist
          <input
            name="artist"
            maxLength={200}
            defaultValue={artist}
            placeholder="Name contains…"
          />
        </label>
        <label>
          Release year
          <input
            name="year"
            type="number"
            min="1860"
            max="2200"
            defaultValue={filters.year}
          />
        </label>
        <label>
          Decade
          <select name="decade" defaultValue={filters.decade ?? ""}>
            <option value="">All decades</option>
            {Array.from({ length: 35 }, (_, i) => 1860 + i * 10).map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Apply</button>
        <Link href="/leaderboard">Clear filters</Link>
      </form>
      <LiveLeaderboard
        key={query.toString() + page}
        initial={initial}
        page={page}
        sort={sort}
        query={query.toString()}
        live={!isDemoMode()}
      />
    </section>
  );
}
