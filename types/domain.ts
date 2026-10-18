export type SongStatus = "active" | "unavailable" | "disabled";
export type UserRole = "user" | "admin";

export interface SongProvider {
  provider: "youtube" | "spotify" | "apple_music" | "musicbrainz";
  providerSongId: string;
  externalUrl: string;
}

export interface Song {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  artworkUrl: string | null;
  artworkSourceUrl?: string | null;
  artworkAttribution?: string | null;
  audioPreview?: import("@/lib/audio").AudioPreview | null;
  releaseYear: number;
  releaseDate?: string | null;
  metadataDetails?: {
    originalDate: string | null;
    albumDate: string | null;
    recordingId: string;
  } | null;
  durationMs?: number | null;
  recentMovement?: number;
  genre: string | null;
  eloRating: number;
  wins: number;
  losses: number;
  matchupCount: number;
  status: SongStatus;
  providers: SongProvider[];
  youtubeValidation?: {
    videoId: string;
    madeForKids: boolean | null;
    checkedAt: string;
  } | null;
}

export interface Matchup {
  id: string;
  matchupDay: string;
  number: number;
  startsAt: string;
  endsAt: string;
  songA: Song;
  songB: Song;
  totalVotes: number;
  songAVotes: number;
  songBVotes: number;
  selectedSongId: string | null;
}

export interface Profile {
  userId: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  currentStreak: number;
  longestStreak: number;
  totalVotes: number;
  lastVoteDay: string | null;
}

export interface VoteHistory {
  id: string;
  created_at: string;
  rating_delta: number;
  matchup_day: string;
  matchup_number: number;
  title: string;
  artist_name: string;
  genre: string | null;
  agreement: number;
  selected_song_id?: string;
}
export interface SongMatchupHistory {
  matchup_day: string;
  song_a_title: string;
  song_b_title: string;
  song_a_votes: number;
  song_b_votes: number;
}

export interface ViewerState {
  user: { id: string; email?: string; isAnonymous?: boolean } | null;
  profile: Profile | null;
  isAdmin: boolean;
}
