import { getSong } from "@/lib/data";
import { listeningSong, type RankPair } from "@/lib/rank";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface PlayState {
  run: {
    id: string;
    score: number;
    status: "active" | "paused" | "ended";
    reason: string | null;
  };
  round: {
    id: string;
    number: number;
    songAId: string;
    songBId: string;
    expiresAt: string;
  } | null;
  answer: {
    id: string;
    runId: string;
    titleA: string;
    titleB: string;
    ratingA: number;
    ratingB: number;
    selectedSongId: string;
    correct: boolean;
    scoreAfter: number;
    replacementSlot: number | null;
  } | null;
}
export const roundIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function getPlayState(
  answered?: string,
): Promise<PlayState | null> {
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_play_state", {
    p_answered_round_id: answered ?? null,
  });
  if (error)
    throw new Error("Could not load your saved Play run. Please retry.");
  return data;
}
export async function getPlayPair(
  round: NonNullable<PlayState["round"]>,
): Promise<RankPair | null> {
  const [a, b] = await Promise.all([
    getSong(round.songAId),
    getSong(round.songBId),
  ]);
  if (!a || !b) return null;
  return {
    id: round.id,
    expiresAt: round.expiresAt,
    songA: listeningSong(a.song),
    songB: listeningSong(b.song),
  };
}
