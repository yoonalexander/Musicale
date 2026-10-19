"use server";
import type { Route } from "next";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getViewerState } from "@/lib/data";
import {
  songId,
  utcWindow,
  validateSong,
  validEmailTokenHash,
  type SongInput,
} from "@/lib/validation";
import { requireAdmin } from "@/lib/auth";
import { parseCatalog } from "@/lib/import";
import editorialPairs from "@/data/editorial-pairs.json";
import { syncAuthorizedPreviews } from "@/lib/sync-previews";
import { searchYouTubeVideos, type YouTubeVideo } from "@/lib/youtube-data";

const go = (path: string, key: string, value: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(value)}` as Route);
export async function discoverYouTube(
  id: string,
  _previous: { videos: YouTubeVideo[]; error: string },
  fd: FormData,
): Promise<{ videos: YouTubeVideo[]; error: string }> {
  await requireAdmin();
  const db = await getSupabaseServerClient();
  const budget = await db!.rpc("reserve_request", { p_action: "admin" });
  if (budget.error || !budget.data)
    return {
      videos: [],
      error: "Too many admin requests. Please wait a minute.",
    };
  try {
    songId(id);
    const region = String(fd.get("region") ?? "")
      .trim()
      .toUpperCase();
    const { data, error } = await db!
      .from("songs")
      .select("title,artist_name")
      .eq("id", id)
      .single();
    if (error || !data)
      return {
        videos: [],
        error: "Save the song before searching for a recording.",
      };
    const videos = await searchYouTubeVideos(
      data.artist_name,
      data.title,
      region,
    );
    return {
      videos,
      error: videos.length
        ? ""
        : "No embeddable candidates were returned for this country. Review another official source or try a different country.",
    };
  } catch (error) {
    return {
      videos: [],
      error:
        error instanceof Error ? error.message : "YouTube discovery failed.",
    };
  }
}
export async function requestMagicLinkAction(fd: FormData) {
  if (!isSupabaseConfigured())
    go("/login", "message", "Configure Supabase to enable sign in.");
  const email = String(fd.get("email") ?? "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    go("/login", "message", "Enter a valid email address.");
  const db = await getSupabaseServerClient();
  let failed = false;
  try {
    const {
      data: { user },
    } = await db!.auth.getUser();
    let result;
    if (user?.is_anonymous) {
      result = await db!.auth.updateUser(
        { email },
        { emailRedirectTo: `${getSiteUrl()}/api/auth/guest-confirm` },
      );
    }
    if (
      !result ||
      (result.error &&
        ["email_exists", "user_already_exists"].includes(
          result.error.code ?? "",
        ))
    ) {
      result = await db!.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${getSiteUrl()}/api/auth/callback` },
      });
    }
    const { error } = result;
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  go(
    "/login",
    "message",
    failed
      ? "Could not send a sign-in link. Wait a minute, then request a new link."
      : "Magic link sent. Check your inbox.",
  );
}
export async function signOutAction() {
  const db = await getSupabaseServerClient();
  await db?.auth.signOut();
  redirect("/");
}
export async function confirmEmailSignIn(fd: FormData) {
  const tokenHash = fd.get("tokenHash");
  if (!isSupabaseConfigured() || !validEmailTokenHash(tokenHash))
    return go("/login", "message", "Invalid sign-in link. Request a new link.");
  const db = await getSupabaseServerClient();
  let failed = false;
  try {
    const { error } = await db!.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    failed = Boolean(error);
  } catch {
    go(
      "/login",
      "message",
      "Sign-in is temporarily unavailable. Please request a new link shortly.",
    );
  }
  if (failed)
    go(
      "/login",
      "message",
      "Sign-in link expired or was already used. Request a new link.",
    );
  redirect("/today");
}
export async function submitDailyVote(fd: FormData) {
  if (!isSupabaseConfigured())
    go("/today", "error", "Connect Supabase to record votes.");
  const viewer = await getViewerState();
  if (!viewer.user)
    go(
      "/login",
      "message",
      "Sign in again to vote. Your saved votes are safe.",
    );
  const matchupId = String(fd.get("matchupId") ?? "");
  const selectedSongId = String(fd.get("selectedSongId") ?? "");
  if (
    !/^[0-9a-f-]{36}$/i.test(matchupId) ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(selectedSongId)
  )
    go("/today", "error", "Invalid vote. Reload today’s matchup.");
  const db = await getSupabaseServerClient();
  const { error, data } = await db!.rpc("submit_daily_vote", {
    p_matchup_id: matchupId,
    p_selected_song_id: selectedSongId,
  });
  if (error || data?.error) {
    const message = error?.message ?? String(data.error);
    const known = [
      "already voted",
      "not active",
      "not in this matchup",
      "Both songs must be active",
      "Playback is unavailable",
      "Too many vote attempts",
    ];
    go(
      "/today",
      "error",
      known.some((s) => message.includes(s))
        ? message
        : "Could not record your vote. Please try again.",
    );
  }
  revalidatePath("/today");
  revalidatePath("/leaderboard");
  revalidateTag("leaderboard");
  revalidatePath("/profile");
  revalidatePath("/songs/[id]", "page");
  redirect("/today");
}
export async function scheduleMatchup(fd: FormData) {
  const v = await requireAdmin();
  let values;
  try {
    const day = String(fd.get("day") ?? "");
    const a = songId(String(fd.get("songA") ?? "")),
      b = songId(String(fd.get("songB") ?? ""));
    if (a === b) throw new Error("Choose two different songs.");
    if (day < new Date().toISOString().slice(0, 10))
      throw new Error("Schedule today or a future day.");
    values = {
      matchup_day: day,
      ...utcWindow(day),
      song_a_id: a,
      song_b_id: b,
      created_by: v.user!.id,
      status: "scheduled",
      selection_strategy: "editorial",
    };
  } catch (error) {
    go("/admin", "message", (error as Error).message);
  }
  const db = await getSupabaseServerClient();
  const replacement = String(fd.get("replaceId") ?? "");
  const { error, data } = replacement
    ? await db!
        .from("daily_matchups")
        .update(values)
        .eq("id", replacement)
        .gt("starts_at", new Date().toISOString())
        .select("id")
        .maybeSingle()
    : await db!.from("daily_matchups").insert(values).select("id").single();
  revalidatePath("/today");
  revalidatePath("/admin");
  go(
    "/admin",
    "message",
    error || !data
      ? error?.code === "23505"
        ? "That day already has a matchup."
        : "Could not schedule. Choose active songs with playback links and a future unvoted matchup."
      : "Matchup saved.",
  );
}
export async function importSongs(fd: FormData) {
  await requireAdmin();
  let songs: SongInput[] = [];
  try {
    const file = fd.get("file");
    if (file instanceof File && file.size > 200000)
      throw new Error("Import must be smaller than 200 KB.");
    const text =
      file instanceof File && file.size
        ? await file.text()
        : String(fd.get("catalog") ?? "");
    songs = parseCatalog(text, String(fd.get("format") ?? "json")).map(
      (song) => ({
        ...song,
        artworkUrl: null,
        artworkSourceUrl: null,
        artworkAttribution: null,
      }),
    );
  } catch (error) {
    go(
      "/admin",
      "message",
      error instanceof SyntaxError
        ? "Enter valid JSON."
        : (error as Error).message,
    );
  }
  const db = await getSupabaseServerClient();
  const { error, data } = await db!.rpc("save_catalog", { p_songs: songs });
  let previewNotice = "";
  if (!error && !data?.error) {
    try {
      previewNotice = await syncAuthorizedPreviews();
    } catch {
      previewNotice =
        "Preview discovery unavailable; retry in Audio administration.";
    }
  }
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  revalidateTag("leaderboard");
  revalidatePath("/today");
  revalidatePath("/songs/[id]", "page");
  go(
    "/admin",
    "message",
    error || data?.error
      ? "Import failed; no songs were changed. Check provider IDs for duplicates."
      : `${songs.length} songs saved. ${previewNotice}`,
  );
}
export async function updateSongStatus(fd: FormData) {
  await requireAdmin();
  const status = String(fd.get("status"));
  if (!["active", "unavailable", "disabled"].includes(status))
    go("/admin", "message", "Invalid status.");
  let id;
  try {
    id = songId(String(fd.get("id")));
  } catch {
    go("/admin", "message", "Invalid song ID.");
  }
  const db = await getSupabaseServerClient();
  const { error } = await db!
    .from("songs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/today");
  revalidatePath("/leaderboard");
  revalidateTag("leaderboard");
  revalidatePath("/songs/[id]", "page");
  go(
    "/admin",
    "message",
    error ? "Could not change song status." : "Song status saved.",
  );
}
export async function updateKFactor(fd: FormData) {
  await requireAdmin();
  const k = Number(fd.get("kFactor"));
  if (!Number.isInteger(k) || k < 1 || k > 100)
    go("/admin", "message", "K-factor must be an integer between 1 and 100.");
  const db = await getSupabaseServerClient();
  const { error } = await db!
    .from("app_settings")
    .update({ elo_k_factor: k })
    .eq("id", true);
  revalidatePath("/admin");
  go(
    "/admin",
    "message",
    error ? "Could not save K-factor." : "K-factor saved for future votes.",
  );
}
export async function saveSong(fd: FormData) {
  await requireAdmin();
  let song!: SongInput;
  try {
    const providers = [
      "youtube",
      "spotify",
      "apple_music",
      "musicbrainz",
    ].flatMap((provider) => {
      const externalUrl = String(fd.get(`${provider}Url`) ?? "").trim();
      const providerSongId = String(fd.get(`${provider}Id`) ?? "").trim();
      return externalUrl || providerSongId
        ? [{ provider, externalUrl, providerSongId }]
        : [];
    });
    song = validateSong({
      ...Object.fromEntries(fd),
      providers,
      artworkUrl: null,
      artworkSourceUrl: null,
      artworkAttribution: null,
    });
  } catch (error) {
    go("/admin", "message", (error as Error).message);
  }
  const db = await getSupabaseServerClient();
  const { error, data } = await db!.rpc("save_catalog", { p_songs: [song] });
  let previewNotice = "";
  if (!error && !data?.error) {
    try {
      previewNotice = await syncAuthorizedPreviews();
    } catch {
      previewNotice =
        "Preview discovery unavailable; retry in Audio administration.";
    }
  }
  ["/admin", "/today", "/leaderboard"].forEach((p) => revalidatePath(p));
  revalidateTag("leaderboard");
  revalidatePath("/songs/[id]", "page");
  go(
    "/admin",
    "message",
    error || data?.error
      ? "Song could not be saved. Check for duplicate provider IDs."
      : `Song saved. ${previewNotice}`,
  );
}
export async function updateDisplayName(fd: FormData) {
  const v = await getViewerState();
  if (!v.user || v.user.isAnonymous) redirect("/login");
  const name = String(fd.get("displayName") ?? "").trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name))
    go("/profile", "message", "Use a name of 1 to 60 characters.");
  const db = await getSupabaseServerClient();
  const { error, data } = await db!.rpc("update_my_display_name", {
    p_name: name,
  });
  revalidatePath("/profile");
  go(
    "/profile",
    "message",
    error || data?.error
      ? (data?.error ?? "Could not save display name.")
      : "Display name saved.",
  );
}
export async function manageMatchup(fd: FormData) {
  await requireAdmin();
  const db = await getSupabaseServerClient();
  const id = String(fd.get("id") ?? "");
  const operation = String(fd.get("operation"));
  if (
    !["feature", "cancel"].includes(operation) ||
    !/^[0-9a-f-]{36}$/i.test(id)
  )
    go("/admin", "message", "Invalid matchup action.");
  const query = db!
    .from("daily_matchups")
    .update(
      operation === "feature"
        ? { featured: fd.get("featured") === "on" }
        : { status: "cancelled" },
    )
    .eq("id", id);
  const { data, error } =
    operation === "feature"
      ? await query.select("id")
      : await query
          .gt("starts_at", new Date().toISOString())
          .eq("song_a_votes", 0)
          .eq("song_b_votes", 0)
          .select("id");
  revalidatePath("/admin");
  revalidatePath("/archive");
  revalidatePath("/today");
  go(
    "/admin",
    "message",
    error || !data?.length
      ? "Could not update matchup. Only future unvoted matchups can be cancelled."
      : operation === "feature"
        ? "Featured setting saved."
        : "Matchup cancelled.",
  );
}
export async function rebuildRankings(fd: FormData) {
  await requireAdmin();
  if (fd.get("confirm") !== "on")
    go("/admin", "message", "Confirm the ranking rebuild first.");
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("rebuild_rankings");
  ["/admin", "/today", "/leaderboard", "/profile"].forEach((p) =>
    revalidatePath(p),
  );
  revalidateTag("leaderboard");
  revalidatePath("/songs/[id]", "page");
  go(
    "/admin",
    "message",
    error || data?.error
      ? "Rebuild failed. No rankings were changed; inspect the audit records."
      : `Rankings rebuilt from ${data} recorded votes.`,
  );
}
export async function scheduleEditorialMonth() {
  await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const matchups = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i + 1);
    const [songA, songB] = editorialPairs[(i + 1) % editorialPairs.length];
    return { day: date.toISOString().slice(0, 10), songA, songB };
  });
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("schedule_matchup_batch", {
    p_matchups: matchups,
  });
  revalidatePath("/admin");
  revalidatePath("/today");
  go(
    "/admin",
    "message",
    error || data?.error
      ? "Queue failed; no matchups were added. Import the starter catalog and ensure all selected songs are active with playback links."
      : `${data} editorial matchups added. Existing days were preserved.`,
  );
}
