"use server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { revalidatePath, revalidateTag } from "next/cache";
import { getViewerState } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

async function client() {
  if (!isSupabaseConfigured())
    redirect("/rank?error=Rank+is+disabled+in+preview" as Route);
  if (!(await getViewerState()).user)
    redirect("/login?message=Sign+in+to+rank+music");
  return (await getSupabaseServerClient())!;
}
function fail(message: string): never {
  redirect(`/rank?error=${encodeURIComponent(message)}` as Route);
}
export async function startRank() {
  const db = await client();
  const { data, error } = await db.rpc("start_rank_pair");
  if (error || data?.error)
    fail(data?.error ?? "Could not prepare your pair. Please retry.");
  revalidatePath("/rank");
  redirect(
    (data?.comparisonId
      ? "/rank"
      : "/rank?error=No+fresh+pair+is+available.+Four+playable+songs+and+a+ten-minute+repeat-pair+cooldown+are+required.") as Route,
  );
}
export async function submitRankVote(form: FormData) {
  const db = await client();
  const comparisonId = String(form.get("comparisonId") ?? ""),
    selected = String(form.get("selectedSongId") ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      comparisonId,
    ) ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(selected)
  )
    fail("Invalid choice. Reload your Rank pair.");
  const { data, error } = await db.rpc("submit_rank_vote", {
    p_comparison_id: comparisonId,
    p_selected_song_id: selected,
  });
  if (error) {
    const saved = await db
      .from("rank_votes")
      .select("selected_song_id")
      .eq("comparison_id", comparisonId)
      .eq("user_id", (await getViewerState()).user!.id)
      .maybeSingle();
    if (saved.error || saved.data?.selected_song_id !== selected)
      fail(
        "Your preference could not be confirmed. Check your Profile history before continuing.",
      );
  }
  if (data?.error) fail(data.error);
  revalidateTag("leaderboard");
  for (const path of ["/rank", "/leaderboard", "/today", "/profile"])
    revalidatePath(path);
  revalidatePath("/songs/[id]", "page");
  redirect(`/rank?saved=${comparisonId}` as Route);
}
