"use server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { getViewerState } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { roundIdPattern } from "@/lib/play";

async function client(returnTo: "/" | "/play") {
  if (!isSupabaseConfigured()) fail(returnTo, "Play is disabled in preview.");
  if (!(await getViewerState()).user)
    redirect("/login?message=Sign+in+to+play");
  return (await getSupabaseServerClient())!;
}
function fail(
  returnTo: "/" | "/play",
  message: string,
  answered?: string,
): never {
  redirect(
    `${returnTo}?error=${encodeURIComponent(message)}${answered ? `&answered=${answered}` : ""}` as Route,
  );
}
export async function prepareFreshPlay(
  runId: string,
): Promise<{ error: string | null }> {
  if (!roundIdPattern.test(runId))
    return { error: "Invalid run. Reload Play." };
  const db = await client("/");
  const { data, error } = await db.rpc("start_fresh_play", { p_run_id: runId });
  if (error || data?.error || data?.runId !== runId)
    return {
      error: data?.error ?? "Could not start your run. Please try again.",
    };
  revalidatePath("/");
  revalidatePath("/play");
  revalidatePath("/profile");
  return { error: null };
}
export async function submitPlayGuess(form: FormData) {
  const returnTo = form.get("returnTo") === "/" ? "/" : "/play";
  const db = await client(returnTo);
  const id = String(form.get("roundId") ?? ""),
    selected = String(form.get("selectedSongId") ?? "");
  if (!roundIdPattern.test(id) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(selected))
    fail(returnTo, "Invalid choice. Reload your round.");
  const { data, error } = await db.rpc("submit_play_guess", {
    p_round_id: id,
    p_selected_song_id: selected,
  });
  if (error) {
    const saved = await db.rpc("get_play_state", { p_answered_round_id: id });
    if (
      saved.error ||
      saved.data?.answer?.id !== id ||
      saved.data.answer.selectedSongId !== selected
    )
      fail(
        returnTo,
        "Your guess could not be confirmed. Retry the same choice safely.",
        id,
      );
  }
  if (data?.error)
    fail(
      returnTo,
      /resume|preserved/i.test(data.error)
        ? "That round is no longer available. Start a new run."
        : data.error,
      id,
    );
  revalidatePath("/");
  revalidatePath("/play");
  revalidatePath("/profile");
  redirect(`${returnTo}?answered=${id}` as Route);
}
