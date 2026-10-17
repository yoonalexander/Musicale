import { fetchLeaderboard } from "@/lib/data";
import { leaderboardQuery } from "@/lib/leaderboard-query";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { page, sort, minimum, filters } = leaderboardQuery(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(await fetchLeaderboard(page, sort, minimum, filters), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "Rankings are temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
