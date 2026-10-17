import { getSupabaseServerClient } from "./supabase/server";
import { discoverPreviews, type PreviewSong } from "./preview-discovery";

export async function syncAuthorizedPreviews() {
  const db = (await getSupabaseServerClient())!;
  const { data, error } = await db
    .from("songs")
    .select(
      "id,title,artist_name,release_year,duration_ms,catalog_sources(isrcs,provider,provider_song_id),song_providers(provider,provider_song_id)",
    )
    .limit(1000);
  if (error)
    throw new Error("Could not inspect recordings for preview discovery.");
  const candidates = await discoverPreviews(data as PreviewSong[]);
  if (!candidates.length)
    return "No unique matches in the reviewed open-audio catalog. Existing previews were preserved.";
  const saved = await db.rpc("attach_discovered_previews", {
    p_candidates: candidates,
  });
  if (saved.error || saved.data?.error)
    throw new Error(
      saved.data?.error ??
        "Preview sources could not be saved. Existing sources were preserved.",
    );
  return `${saved.data.attached} authorized previews connected; administrator-managed sources preserved.`;
}
