import { getSong, getViewerState } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Song } from "@/types/domain";

export type RankSong = Pick<
  Song,
  | "id"
  | "title"
  | "artistName"
  | "albumName"
  | "releaseYear"
  | "genre"
  | "durationMs"
  | "artworkUrl"
  | "artworkSourceUrl"
  | "artworkAttribution"
  | "providers"
  | "audioPreview"
>;
export interface RankPair {
  id: string;
  expiresAt: string;
  songA: RankSong;
  songB: RankSong;
}
export function listeningSong(s: Song): RankSong {
  return {
    id: s.id,
    title: s.title,
    artistName: s.artistName,
    albumName: s.albumName,
    releaseYear: s.releaseYear,
    genre: s.genre,
    durationMs: s.durationMs,
    artworkUrl: s.artworkUrl,
    artworkSourceUrl: s.artworkSourceUrl,
    artworkAttribution: s.artworkAttribution,
    providers: s.providers,
    audioPreview: s.audioPreview,
  };
}
export async function getRankPair(): Promise<RankPair | null> {
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_rank_state");
  if (error) throw new Error("Could not load your Rank pair. Please retry.");
  if (!data) return null;
  const [a, b] = await Promise.all([
    getSong(data.song_a_id),
    getSong(data.song_b_id),
  ]);
  if (!a || !b) return null;
  return {
    id: data.id,
    expiresAt: data.expires_at,
    songA: listeningSong(a.song),
    songB: listeningSong(b.song),
  };
}
export async function getRankHistory(page = 1) {
  const viewer = await getViewerState();
  if (!viewer.user) throw new Error("Sign in to view Rank history.");
  const db = await getSupabaseServerClient();
  const { data, error, count } = await db!
    .from("rank_votes")
    .select(
      "id,comparison_id,created_at,rating_delta,selected_song_id,rejected_song_id,selected:songs!selected_song_id(title,artist_name),rejected:songs!rejected_song_id(title,artist_name)",
      { count: "exact" },
    )
    .eq("user_id", viewer.user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1);
  if (error?.code === "PGRST103") {
    const total = await db!
      .from("rank_votes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.user.id);
    if (total.error)
      throw new Error("Could not load Rank history. Please retry.");
    return { total: total.count ?? 0, history: [] };
  }
  if (error) throw new Error("Could not load Rank history. Please retry.");
  return {
    total: count ?? 0,
    history: (data ?? []).map((r) => ({
      id: r.id,
      comparisonId: r.comparison_id,
      createdAt: r.created_at,
      delta: r.rating_delta,
      selectedId: r.selected_song_id,
      rejectedId: r.rejected_song_id,
      selected: r.selected as unknown as { title: string; artist_name: string },
      rejected: r.rejected as unknown as { title: string; artist_name: string },
    })),
  };
}
