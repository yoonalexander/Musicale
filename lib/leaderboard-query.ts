export const pageSize = 25;
export const pageSizes = [25, 50, 100, 500] as const;
export type LeaderSort = "rating" | "wins" | "votes" | "movement";
export type LeaderFilters = {
  genre?: string;
  artist?: string;
  year?: number;
  decade?: number;
};
export function leaderboardQuery(params: Record<string, string | undefined>) {
  const requestedSize = Number(params.pageSize);
  const perPage = pageSizes.find((size) => size === requestedSize) ?? pageSize;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(params.page ?? "1") || 1),
  );
  const sort: LeaderSort = ["rating", "wins", "votes", "movement"].includes(
    params.sort ?? "",
  )
    ? (params.sort as LeaderSort)
    : "rating";
  const minimum = Math.min(
    100000,
    Math.max(0, Number.parseInt(params.minimum ?? "0") || 0),
  );
  const genre = (params.genre ?? "").trim().slice(0, 100),
    artist = (params.artist ?? "").trim().slice(0, 200);
  const year = Number(params.year),
    decade = Number(params.decade);
  const filters = {
    genre,
    artist,
    year:
      Number.isInteger(year) && year >= 1860 && year <= 2200 ? year : undefined,
    decade:
      Number.isInteger(decade) &&
      decade >= 1860 &&
      decade <= 2200 &&
      decade % 10 === 0
        ? decade
        : undefined,
  };

  return { page, sort, minimum, filters, pageSize: perPage };
}
