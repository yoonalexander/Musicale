"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { musicBrainzAdapter, recordingId } from "@/lib/music-catalog";
import { songId } from "@/lib/validation";
import { httpsUrl, playablePreview, type AudioPreview } from "@/lib/audio";

export interface Duplicate {
  song_id: string;
  reason: "identifier" | "metadata";
}
export interface CatalogSelection {
  providerId: string;
  targetSongId?: string;
  createSeparate?: boolean;
}

async function catalogService() {
  const db = await getSupabaseServerClient();
  const adapter = musicBrainzAdapter(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await db!.rpc("reserve_catalog_provider_call");
      if (error) throw new Error("Could not reserve the catalog request.");
      if (data) return;
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    throw new Error("Catalog is busy. Wait a moment and retry.");
  });
  return { db: db!, adapter };
}
function errorMessage(error: unknown) {
  return error instanceof Error &&
    !["fetch failed", "The operation was aborted due to timeout"].includes(
      error.message,
    )
    ? error.message
    : "Catalog provider unavailable. Please retry later.";
}
export async function searchExternalCatalog(query: string, offset = 0) {
  await requireAdmin();
  try {
    const { db, adapter } = await catalogService();
    const budget = await db.rpc("reserve_request", { p_action: "admin" });
    if (budget.error || !budget.data)
      throw new Error("Too many requests. Try again next minute.");
    const results = await adapter.search(query, offset);
    const duplicates = await db.rpc("catalog_duplicates", {
      p_candidates: results.candidates,
    });
    if (duplicates.error)
      throw new Error("Could not review catalog duplicates.");
    const matches = duplicates.data as {
      providerId: string;
      matches: Duplicate[];
    }[];
    return {
      ...results,
      candidates: results.candidates.map((c) => ({
        ...c,
        matches:
          matches.find((m) => m.providerId === c.providerId)?.matches ?? [],
      })),
      error: null,
    };
  } catch (error) {
    return { candidates: [], total: 0, error: errorMessage(error) };
  }
}
export async function importExternalSongs(selections: CatalogSelection[]) {
  await requireAdmin();
  try {
    if (
      !Array.isArray(selections) ||
      selections.length < 1 ||
      selections.length > 10
    )
      throw new Error("Select 1 to 10 recordings.");
    const selected = selections.map((s) => ({
      providerId: recordingId(s.providerId),
      targetSongId: s.targetSongId ? songId(s.targetSongId) : undefined,
      createSeparate: s.createSeparate === true,
    }));
    if (new Set(selected.map((s) => s.providerId)).size !== selected.length)
      throw new Error("Select each recording once.");
    const { db, adapter } = await catalogService();
    const budget = await db.rpc("reserve_request", { p_action: "admin" });
    if (budget.error || !budget.data)
      throw new Error("Too many requests. Try again next minute.");
    const candidates = [];
    // Re-fetch selected identifiers on the server: browser-supplied metadata never enters the database.
    for (const selection of selected)
      candidates.push({
        ...(await adapter.lookup(selection.providerId)),
        ...selection,
      });
    const { data, error } = await db.rpc("ingest_catalog", {
      p_candidates: candidates,
    });
    if (error || data?.error)
      throw new Error(
        data?.error ?? "Catalog import failed. No songs changed.",
      );
    revalidateTag("leaderboard");
    for (const path of ["/admin", "/today", "/leaderboard"])
      revalidatePath(path);
    revalidatePath("/songs/[id]", "page");
    return { error: null, songIds: data.songIds as string[] };
  } catch (error) {
    return { error: errorMessage(error), songIds: [] };
  }
}
export async function saveAudioSource(form: FormData) {
  await requireAdmin();
  try {
    const id = songId(String(form.get("songId") ?? ""));
    const preview: AudioPreview = {
      provider: String(form.get("provider") ?? "").trim(),
      url: httpsUrl(form.get("url")),
      availability: String(
        form.get("availability"),
      ) as AudioPreview["availability"],
      licensingStatus: String(
        form.get("licensingStatus"),
      ) as AudioPreview["licensingStatus"],
      authorizationUrl: httpsUrl(form.get("authorizationUrl")),
      attribution: String(form.get("attribution") ?? "").trim(),
    };
    if (
      !preview.provider ||
      preview.provider.length > 100 ||
      preview.attribution.length > 1000 ||
      !["unknown", "available", "unavailable"].includes(preview.availability) ||
      !["unreviewed", "authorized", "rejected"].includes(
        preview.licensingStatus,
      ) ||
      (form.get("url") && !preview.url) ||
      (form.get("authorizationUrl") && !preview.authorizationUrl)
    )
      throw new Error("Enter valid audio details and HTTPS URLs.");
    if (
      preview.licensingStatus === "authorized" &&
      (form.get("confirmAuthorization") !== "on" ||
        !playablePreview({ ...preview, availability: "available" }))
    )
      throw new Error(
        "Confirm authorization for Musicale and supply its evidence and attribution.",
      );
    const db = await getSupabaseServerClient();
    const { error, data } = await db!.rpc("save_audio_source", {
      p_song_id: id,
      p_preview: preview,
    });
    if (error || data?.error)
      throw new Error(data?.error ?? "Audio source could not be saved.");
    revalidateTag("leaderboard");
    revalidatePath("/admin");
    revalidatePath("/today");
    revalidatePath("/songs/[id]", "page");
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
