export const analyticsEvents = [
  "landing_view",
  "sign_in_started",
  "daily_view",
  "listening_link_clicked",
  "preview_play_started",
  "preview_play_failed",
  "youtube_player_ready",
  "youtube_play_started",
  "youtube_player_error",
  "vote_submitted",
  "share_copied",
  "leaderboard_view",
  "streak_continued",
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];
export function track(event: AnalyticsEvent) {
  try {
    if (
      localStorage.getItem("musicale-analytics") !== "yes" ||
      navigator.doNotTrack === "1"
    )
      return;
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Storage and analytics failures never block the product. */
  }
}
