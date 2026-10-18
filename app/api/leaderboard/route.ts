import { fetchLeaderboard } from "@/lib/data";
import { leaderboardQuery } from "@/lib/leaderboard-query";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { page, sort, minimum, filters } = leaderboardQuery(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await fetchLeaderboard(page, sort, minimum, filters);
    return Response.json(
      {
        ...result,
        songs: result.songs.map(({ metadataDetails, ...song }) => song),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Rankings are temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
