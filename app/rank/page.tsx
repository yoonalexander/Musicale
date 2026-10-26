import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getRankPair } from "@/lib/rank";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RankPairCards } from "@/components/rank-pair";
import { AutoRank } from "@/components/auto-rank";
import { HowToPlay } from "@/components/how-to-play";
export const metadata = {
  title: "Rank music",
  description:
    "Choose the song you prefer and help build Musicale’s community Elo rankings. Keep comparing new pairs at your own pace.",
};
export default async function Rank({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [viewer, params] = await Promise.all([getViewerState(), searchParams]);
  const pair = viewer.user && !isDemoMode() ? await getRankPair() : null;
  let saved = false;
  if (
    viewer.user &&
    params.saved &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      params.saved,
    )
  ) {
    const db = await getSupabaseServerClient();
    const { data, error } = await db!
      .from("rank_votes")
      .select("id")
      .eq("user_id", viewer.user.id)
      .eq("comparison_id", params.saved)
      .maybeSingle();
    if (error)
      throw new Error("Could not confirm your saved preference. Please retry.");
    saved = Boolean(data);
  }
  return (
    <section className="today game-stage rank-stage">
      <div className="play-toolbar">
        <p className="kicker">Rank</p>
        <HowToPlay mode="rank" />
      </div>
      <header className="game-question">
        <h1>Which song do you prefer?</h1>
        {params.error ? (
          <p className="notice" role="alert">
            {params.error}
          </p>
        ) : null}
        {saved ? (
          <p key={params.saved} className="notice" role="status">
            Your preference is saved.{" "}
            {pair
              ? "Here are two new songs."
              : "No fresh pair is available right now. Try again later."}
          </p>
        ) : null}
      </header>
      {isDemoMode() ? (
        <section className="panel">
          <p>
            Preview mode — guest ranking and persistent voting are disabled.
          </p>
          <Link className="button" href="/leaderboard">
            Browse the catalog
          </Link>
        </section>
      ) : pair ? (
        <RankPairCards key={pair.id} pair={pair} />
      ) : (
        <AutoRank />
      )}
      {!viewer.user || viewer.user.isAnonymous ? (
        <p className="guest-note">
          Rank as a guest. <Link href="/login">Sign in</Link> to view your
          preference history.
        </p>
      ) : null}
    </section>
  );
}
