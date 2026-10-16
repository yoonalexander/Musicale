import {
  pageSize,
  type LeaderSort,
  type LeaderFilters,
} from "@/lib/leaderboard-query";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { demoMatchup, demoSongs } from "@/lib/catalog";
import { env, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { currentStreak } from "@/lib/elo";
import { mapProviders } from "@/lib/providers";
import type {
  Matchup,
  Profile,
  Song,
  SongMatchupHistory,
  ViewerState,
  VoteHistory,
} from "@/types/domain";

function check(error: { message: string } | null) {
  if (error) {
    console.error("Musicale database:", error.message);
    throw new Error(
      "Musicale could not load its database. Check that all migrations have been applied.",
    );
  }
}
function mapSong(r: Record<string, unknown>): Song {
  return {
    id: String(r.id),
    title: String(r.title),
    artistName: String(r.artist_name),
    albumName: String(r.album_name ?? "Single"),
    artworkUrl: r.artwork_url as string | null,
    releaseYear: Number(r.release_year),
    releaseDate: r.release_date as string | null,
    durationMs: r.duration_ms ? Number(r.duration_ms) : null,
    recentMovement: Number(r.recent_movement ?? 0),
    genre: r.genre as string | null,
    eloRating: Number(r.elo_rating),
    wins: Number(r.wins),
    losses: Number(r.losses),
    matchupCount: Number(r.matchup_count),
    status: r.status as Song["status"],
    providers: mapProviders(r.providers),
  };
}
export const getViewerState = cache(async (): Promise<ViewerState> => {
  if (!isSupabaseConfigured())
    return { user: null, profile: null, isAdmin: false };
  const db = await getSupabaseServerClient();
  const {
    data: { user },
  } = await db!.auth.getUser();
  if (!user) return { user: null, profile: null, isAdmin: false };
  const { data: p, error } = await db!
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  check(error);
  const profile: Profile | null = p
    ? {
        userId: p.user_id,
        displayName: p.display_name,
        role: p.role,
        createdAt: p.created_at,
        lastVoteDay: p.last_vote_day,
        currentStreak: currentStreak(
          p.last_vote_day,
          p.current_streak,
          new Date().toISOString().slice(0, 10),
        ),
        longestStreak: p.longest_streak,
        totalVotes: p.total_votes,
      }
    : null;
  return {
    user: { id: user.id, email: user.email },
    profile,
    isAdmin: profile?.role === "admin",
  };
});

export async function getTodayMatchup(): Promise<Matchup | null> {
  if (!isSupabaseConfigured()) return demoMatchup();
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_today_matchup");
  check(error);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.matchup_id,
    matchupDay: row.matchup_day,
    number: row.matchup_number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    songA: mapSong(row.song_a),
    songB: mapSong(row.song_b),
    totalVotes: Number(row.total_votes ?? 0),
    songAVotes: Number(row.song_a_votes ?? 0),
    songBVotes: Number(row.song_b_votes ?? 0),
    selectedSongId: row.selected_song_id,
  };
}

export async function fetchLeaderboard(
  page = 1,
  sort: LeaderSort = "rating",
  minimum = 0,
  filters: LeaderFilters = {},
) {
  if (!isSupabaseConfigured()) {
    const filtered = [...demoSongs].filter(
      (s) =>
        s.matchupCount >= minimum &&
        (!filters.genre || s.genre === filters.genre) &&
        (!filters.artist ||
          s.artistName.toLowerCase().includes(filters.artist.toLowerCase())) &&
        (!filters.year || s.releaseYear === filters.year) &&
        (!filters.decade ||
          Math.floor(s.releaseYear / 10) * 10 === filters.decade),
    );
    filtered.sort(
      (a, b) =>
        (sort === "votes"
          ? b.matchupCount - a.matchupCount
          : sort === "wins"
            ? b.wins / (b.matchupCount || 1) - a.wins / (a.matchupCount || 1)
            : b.eloRating - a.eloRating) || a.id.localeCompare(b.id),
    );
    return {
      songs: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
    };
  }
  // This cache contains only public catalog data; never use cookies or a viewer session here.
  const db = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  const column = {
    rating: "elo_rating",
    wins: "win_percentage",
    votes: "matchup_count",
    movement: "recent_movement",
  }[sort];
  let query = db!
    .from("song_catalog")
    .select("*", { count: "exact" })
    .eq("status", "active")
    .gte("matchup_count", minimum);
  if (filters.genre) query = query.eq("genre", filters.genre);
  if (filters.artist)
    query = query.ilike(
      "artist_name",
      `%${filters.artist.replace(/[%_\\]/g, "\\$&")}%`,
    );
  if (filters.year) query = query.eq("release_year", filters.year);
  if (filters.decade)
    query = query
      .gte("release_year", filters.decade)
      .lt("release_year", filters.decade + 10);
  const { data, error, count } = await query
    .order(column, { ascending: false })
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error?.code === "PGRST103") {
    // A live removal can leave the requested page beyond the filtered catalog.
    const first = await query.range(0, 0);
    check(first.error);
    return { songs: [], total: first.count ?? 0 };
  }
  check(error);
  return { songs: (data ?? []).map(mapSong), total: count ?? 0 };
}
export const getLeaderboard = unstable_cache(
  fetchLeaderboard,
  ["public-leaderboard", env.supabaseUrl ?? "preview"],
  { revalidate: 30, tags: ["leaderboard"] },
);
export const getSong = cache(async (id: string) => {
  if (!isSupabaseConfigured()) {
    const song = demoSongs.find((s) => s.id === id);
    return song ? { song, rank: demoSongs.indexOf(song) + 1 } : null;
  }
  const db = await getSupabaseServerClient();
  const { data, error } = await db!
    .from("song_catalog")
    .select("*")
    .eq("id", id)
    .neq("status", "disabled")
    .maybeSingle();
  check(error);
  return data
    ? { song: mapSong(data), rank: data.global_rank as number | null }
    : null;
});
export async function getVoteHistory(): Promise<VoteHistory[]> {
  if (!isSupabaseConfigured()) return [];
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_my_vote_history");
  check(error);
  return data ?? [];
}
export async function getSongHistory(id: string) {
  if (!isSupabaseConfigured())
    return { snapshots: [], matchups: [] as SongMatchupHistory[] };
  const db = await getSupabaseServerClient();
  const [snapshots, matchups] = await Promise.all([
    db!
      .from("song_rating_snapshots")
      .select("rating,snapshot_date")
      .eq("song_id", id)
      .order("snapshot_date", { ascending: false })
      .limit(60),
    db!.rpc("get_song_matchups", { p_song_id: id }),
  ]);
  check(snapshots.error);
  check(matchups.error);
  return {
    snapshots: (snapshots.data ?? []).reverse() as {
      rating: number;
      snapshot_date: string;
    }[],
    matchups: (matchups.data ?? []) as SongMatchupHistory[],
  };
}
export async function getAdminData() {
  const db = await getSupabaseServerClient();
  const [songs, matchups, settings, audit, overview, events] =
    await Promise.all([
      db!.from("song_catalog").select("*").order("title").limit(1000),
      db!
        .from("daily_matchups")
        .select("*")
        .gte(
          "matchup_day",
          new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        )
        .order("matchup_day")
        .limit(90),
      db!.from("app_settings").select("elo_k_factor").single(),
      db!
        .from("admin_audit_log")
        .select("id,entity,entity_id,operation,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      db!.rpc("get_admin_overview"),
      db!
        .from("product_event_counts")
        .select("*")
        .order("event_day", { ascending: false })
        .limit(240),
    ]);
  [songs, matchups, settings, audit, overview, events].forEach((r) =>
    check(r.error),
  );
  return {
    songs: (songs.data ?? []).map(mapSong),
    matchups: matchups.data ?? [],
    kFactor: settings.data!.elo_k_factor,
    audit: audit.data ?? [],
    overview: overview.data as AdminOverview,
    events: (events.data ?? []) as {
      event_day: string;
      event: string;
      count: number;
    }[],
  };
}
export interface ProfileData {
  total: number;
  history: VoteHistory[];
  stats: {
    sample: number;
    majority: number;
    artists: { label: string; count: number }[];
    genres: { label: string; count: number }[];
    picks: {
      song_id: string;
      title: string;
      artist_name: string;
      count: number;
    }[];
    controversial: {
      title: string;
      artist_name: string;
      matchup_day: string;
      agreement: number;
    }[];
  };
}
export interface AdminOverview {
  accounts: number;
  votes: number;
  todayVotes: number;
  daily: { matchup_day: string; votes: number; status: string }[];
  suspicious: { user_id: string; attempts: number; limited_minutes: number }[];
}
export async function getProfileData(page = 1): Promise<ProfileData> {
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_my_profile_data", {
    p_offset: (page - 1) * 25,
  });
  check(error);
  return data;
}
export async function getFeaturedMatchups(): Promise<
  {
    matchup_day: string;
    matchup_number: number;
    song_a_id: string;
    song_a_title: string;
    song_b_id: string;
    song_b_title: string;
    song_a_votes: number;
    song_b_votes: number;
  }[]
> {
  if (!isSupabaseConfigured()) return [];
  const db = await getSupabaseServerClient();
  const { data, error } = await db!.rpc("get_featured_matchups");
  check(error);
  return data ?? [];
}
export const isDemoMode = () => !isSupabaseConfigured();
