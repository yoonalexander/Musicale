"use server";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { getViewerState } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { roundIdPattern } from "@/lib/play";

async function client() {
  if (!isSupabaseConfigured()) fail("Play is disabled in preview.");
  if (!(await getViewerState()).user)
    redirect("/login?message=Sign+in+to+play");
  return (await getSupabaseServerClient())!;
}
function fail(message: string, answered?: string): never {
  redirect(
    `/play?error=${encodeURIComponent(message)}${answered ? `&answered=${answered}` : ""}` as Route,
  );
}
export async function startPlay(form: FormData) {
  const db = await client();
  const restart = String(form.get("restartRunId") ?? "");
  if (restart && !roundIdPattern.test(restart))
    fail("Invalid run. Reload Play.");
  const { data, error } = await db.rpc("start_play", {
    p_restart_run_id: restart || null,
  });
  if (error || data?.error)
    fail(data?.error ?? "Could not prepare your run. Please retry.");
  revalidatePath("/play");
  revalidatePath("/profile");
  redirect("/play" as Route);
}
export async function submitPlayGuess(form: FormData) {
  const db = await client();
  const id = String(form.get("roundId") ?? ""),
    selected = String(form.get("selectedSongId") ?? "");
  if (!roundIdPattern.test(id) || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(selected))
    fail("Invalid choice. Reload your round.");
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
        "Your guess could not be confirmed. Retry the same choice safely.",
        id,
      );
  }
  if (data?.error) fail(data.error, id);
  revalidatePath("/play");
  revalidatePath("/profile");
  redirect(`/play?answered=${id}` as Route);
}
