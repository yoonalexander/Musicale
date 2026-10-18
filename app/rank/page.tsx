import Link from "next/link";
import { getViewerState, isDemoMode } from "@/lib/data";
import { getRankPair } from "@/lib/rank";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RankPairCards } from "@/components/rank-pair";
import { GuestForm } from "@/components/guest-form";
import { SubmitButton } from "@/components/submit-button";
import { startRank, startPreviewRank } from "./actions";
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
  const Form = viewer.user ? "form" : GuestForm;
  return (
    <section className="today game-stage rank-stage">
      <header className="game-question">
        <p className="kicker">Continuous preference ranking</p>
        <h1>Which song do you prefer?</h1>
        <p>Pick your favorite. Both songs change after each vote.</p>
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
      {!isDemoMode() ? (
        <div className="share-actions rank-listening-mode">
          <Form action={startRank}>
            <SubmitButton busyText="Finding songs…">
              Listen and rank
            </SubmitButton>
          </Form>
          <Form action={startPreviewRank}>
            <SubmitButton
              className="button secondary"
              busyText="Finding previews…"
            >
              15-second previews only
            </SubmitButton>
          </Form>
          <p>
            {pair?.previewOnly
              ? "Comparing recordings with authorized in-page previews."
              : "Listen with YouTube or an available audio preview, then pick your favorite."}
          </p>
        </div>
      ) : null}
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
        <section className="panel">
          <h2>Ready for another pair?</h2>
          <p>
            A fresh pair needs at least four playable songs. The same pair has a
            ten-minute cooldown, and pending pairs expire after thirty minutes.
            You can keep voting as new pairs become available.
          </p>
          <Form action={startRank}>
            <SubmitButton busyText="Preparing…">Get a pair</SubmitButton>
          </Form>
        </section>
      )}
      {!viewer.user || viewer.user.isAnonymous ? (
        <p className="guest-note">
          Rank as a guest. <Link href="/login">Sign in</Link> to view your
          preference history.
        </p>
      ) : null}
      <p>
        <Link href="/">Play higher rated</Link>, or{" "}
        <Link href="/today">visit Daily</Link> for the shared UTC matchup, or{" "}
        <Link href="/leaderboard">view the leaderboard</Link>.
      </p>
    </section>
  );
}
