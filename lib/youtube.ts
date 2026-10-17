import { safeProviderUrl } from "./providers";
import type { Song } from "@/types/domain";

export function canTrackYouTube(song: Song, videoId: string, now = Date.now()) {
  const validation = song.youtubeValidation;
  if (
    !validation ||
    validation.videoId !== videoId ||
    validation.madeForKids !== false
  )
    return false;
  const age = now - Date.parse(validation.checkedAt);
  return age >= 0 && age < 86400000;
}

export function youtubeVideoId(value: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  const safe = safeProviderUrl("youtube", value);
  if (!safe) return null;
  const url = new URL(safe);
  const parts = url.pathname.split("/");
  const id =
    url.hostname === "youtu.be"
      ? parts[1]
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : ["embed", "shorts", "live"].includes(parts[1])
          ? parts[2]
          : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function youtubeError(code: number): string {
  if (code === 100) return "This video is private or no longer available.";
  if (code === 101 || code === 150)
    return "This video cannot be embedded here.";
  if (code === 153)
    return "YouTube could not identify this player. Try opening YouTube directly.";
  return "This video could not play here. Try opening YouTube directly.";
}

export interface YouTubePlayer {
  pauseVideo(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
type PlayerEvent = { target: YouTubePlayer };
export interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: {
        autoplay: number;
        controls: number;
        playsinline: number;
        origin: string;
      };
      events: {
        onReady(event: PlayerEvent): void;
        onStateChange(event: PlayerEvent & { data: number }): void;
        onError(event: PlayerEvent & { data: number }): void;
        onAutoplayBlocked(event: PlayerEvent): void;
      };
    },
  ) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeAPI> | undefined;
export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(fail, 15000);
    function cleanup() {
      window.clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
    }
    function fail() {
      cleanup();
      script.remove();
      apiPromise = undefined;
      reject(
        new Error(
          "YouTube could not load. Check your connection or use the link below.",
        ),
      );
    }
    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      if (window.YT?.Player) resolve(window.YT);
      else fail();
      previous?.();
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return apiPromise;
}

// Every mounted Musicale player registers here, including players in other views.
const players = new Set<YouTubePlayer>();
export function registerYouTubePlayer(player: YouTubePlayer) {
  players.add(player);
  return () => {
    players.delete(player);
  };
}
export function pauseOtherYouTubePlayers(active: YouTubePlayer) {
  for (const player of players) {
    if (player !== active) player.pauseVideo();
  }
}
