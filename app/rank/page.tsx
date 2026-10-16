import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getRankPair } from "@/lib/rank";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RankPairCards } from "@/components/rank-pair";
import { SubmitButton } from "@/components/submit-button";
import { startRank } from "./actions";
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
    <section className="today">
      <header>
        <p className="kicker">Continuous preference ranking</p>
        <h1>Which song do you prefer?</h1>
        <p>
          Listen, choose your favorite, then compare two new songs. There is no
          right answer or daily voting quota.
        </p>
        <p>
          Rank updates the shared Elo leaderboard. Your Daily vote and streak
          stay separate.
        </p>
        {params.error ? (
          <p className="notice" role="alert">
            {params.error}
          </p>
        ) : null}
        {saved ? (
          <p className="notice" role="status">
            Your preference is saved.{" "}
            {pair
              ? "Here are two new songs."
              : "No fresh pair is available right now. Try again later."}
          </p>
        ) : null}
      </header>
      {!viewer.user ? (
        <div className="panel">
          <p>
            {isDemoMode()
              ? "Preview mode — sign-in and persistent Rank voting are disabled."
              : "Sign in to record preferences and resume your pending pair."}
          </p>
          <Link
            className="button"
            href={isDemoMode() ? "/leaderboard" : "/login"}
          >
            {isDemoMode() ? "Browse the catalog" : "Sign in"}
          </Link>
        </div>
      ) : pair ? (
        <RankPairCards key={pair.id} pair={pair} />
      ) : (
        <section className="panel">
          <h2>Ready for another pair?</h2>
          <p>
            A fresh pair needs at least four playable songs. The same pair has a
            ten-minute cooldown, and pending pairs expire after thirty minutes.
            You can keep voting as new pairs become available.
          </p>
          <form action={startRank}>
            <SubmitButton busyText="Preparing…">Get a pair</SubmitButton>
          </form>
        </section>
      )}
      <p>
        <Link href="/play">Play higher rated</Link>, or{" "}
        <Link href="/today">visit Daily</Link> for the shared UTC matchup, or{" "}
        <Link href="/leaderboard">view the leaderboard</Link>.
      </p>
    </section>
  );
}
