"use server";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { runMetadataJob } from "@/lib/metadata-jobs";
import { metadataId } from "@/lib/metadata-enrichment";
import { songId } from "@/lib/validation";
import { revalidatePath, revalidateTag } from "next/cache";
function refresh() {
  revalidateTag("leaderboard");
  for (const path of [
    "/admin",
    "/",
    "/play",
    "/rank",
    "/today",
    "/leaderboard",
  ])
    revalidatePath(path);
  revalidatePath("/songs/[id]", "page");
}
export async function metadataProgress() {
  await requireAdmin();
  const db = (await getSupabaseServerClient())!;
  const { data, error } = await db
    .from("song_metadata_jobs")
    .select(
      "song_id,status,attempts,candidates,error,updated_at,artwork_permission,songs(title,artist_name,album_name,release_year,artwork_url)",
    )
    .order("song_id");
  if (error) throw new Error("Could not load metadata progress.");
  return data;
}
export async function enrichNextSong() {
  await requireAdmin();
  const result = await runMetadataJob((await getSupabaseServerClient())!);
  refresh();
  return result;
}
export async function enrichSongMetadata(id: string) {
  await requireAdmin();
  const result = await runMetadataJob(
    (await getSupabaseServerClient())!,
    songId(id),
  );
  refresh();
  if (result.error) throw new Error(result.error);
  return result;
}
export async function retryMetadata(id?: string) {
  await requireAdmin();
  const { error } = await (await getSupabaseServerClient())!.rpc(
    "retry_song_metadata",
    { p_song_id: id ? songId(id) : null },
  );
  if (error) throw new Error("Could not queue metadata retry.");
  refresh();
}
export async function reviewMetadata(form: FormData) {
  await requireAdmin();
  try {
    if (form.get("verifiedMatch") !== "on")
      throw new Error(
        "Verify the recording, version and release edition before accepting it.",
      );
    const id = songId(String(form.get("songId")));
    const [chosenRecording, chosenRelease] = String(
      form.get("candidate") ?? "",
    ).split(":");
    const recordingId = metadataId(
      String(form.get("recordingId") || chosenRecording),
    );
    const releaseValue = form.get("releaseId") || chosenRelease;
    const releaseId = releaseValue
      ? metadataId(String(releaseValue))
      : undefined;
    await retryMetadata(id);
    const result = await runMetadataJob(
      (await getSupabaseServerClient())!,
      id,
      {
        recordingId,
        releaseId,
      },
    );
    if (result.status !== "enriched")
      throw new Error(
        result.error ??
          "The recording was not saved. Refresh progress and review the result.",
      );
    if (form.get("applyAlbum") === "on" || form.get("applyYear") === "on") {
      const saved = await (await getSupabaseServerClient())!.rpc(
        "apply_reviewed_metadata_fields",
        {
          p_song_id: id,
          p_recording_id: recordingId,
          p_expected_year: Number(form.get("expectedYear")),
          p_expected_album: String(form.get("expectedAlbum")),
          p_album: form.get("applyAlbum") === "on",
          p_year: form.get("applyYear") === "on",
        },
      );
      if (saved.error)
        throw new Error(
          "Association saved; editorial fields changed during review. Refresh before correcting them.",
        );
    }
    refresh();
    return result;
  } catch (error) {
    refresh();
    return {
      error: error instanceof Error ? error.message : "Metadata review failed.",
    };
  }
}
export async function authorizeMetadataArtwork(form: FormData) {
  await requireAdmin();
  try {
    const decision = String(form.get("decision") ?? "authorized");
    if (decision === "authorized" && form.get("permission") !== "on")
      throw new Error("Confirm permission to display this cover.");
    const { error } = await (await getSupabaseServerClient())!.rpc(
      "review_metadata_artwork",
      {
        p_song_id: songId(String(form.get("songId"))),
        p_status: decision,
        p_basis: String(form.get("basis") ?? ""),
        p_scope: String(form.get("scope") ?? ""),
        p_evidence: String(form.get("evidence") ?? ""),
        p_attribution: String(form.get("attribution") ?? ""),
      },
    );
    if (error)
      throw new Error(
        "Supply image-specific rights evidence, scope and attribution. Refresh artwork first if its image ID is missing. Existing manual artwork is preserved.",
      );
    refresh();
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Artwork review failed.",
    };
  }
}
