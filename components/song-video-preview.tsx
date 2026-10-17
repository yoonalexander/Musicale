"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { pauseAudioPreview } from "@/components/audio-preview-player";
import {
  loadYouTubeAPI,
  pauseOtherYouTubePlayers,
  registerYouTubePlayer,
  youtubeError,
  youtubeVideoId,
  canTrackYouTube,
  type YouTubePlayer,
} from "@/lib/youtube";
import type { Song } from "@/types/domain";

export function SongVideoPreview({
  song,
}: {
  song: Pick<
    Song,
    "id" | "title" | "artistName" | "providers" | "youtubeValidation"
  >;
}) {
  const source = song.providers.find(
    (provider) => provider.provider === "youtube",
  );
  const videoId = source ? youtubeVideoId(source.externalUrl) : null;
  // Keying the instance disposes the old video even when React reuses a song card.
  return videoId ? (
    <Video
      key={`${song.id}:${videoId}`}
      videoId={videoId}
      title={`${song.title} — ${song.artistName}`}
      trackingUntil={
        canTrackYouTube(song, videoId)
          ? Date.parse(song.youtubeValidation!.checkedAt) + 86400000
          : 0
      }
    />
  ) : null;
}

function Video({
  videoId,
  title,
  trackingUntil,
}: {
  videoId: string;
  title: string;
  trackingUntil: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !host.current) return;
    let disposed = false;
    let player: YouTubePlayer | undefined;
    let unregister: (() => void) | undefined;
    let readyTimer: number | undefined;
    setError("");
    setStatus("Loading YouTube player…");
    const container = host.current;
    const mount = document.createElement("div");
    container.replaceChildren(mount);
    function failed(message: string) {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(readyTimer);
      setError(message);
      setStatus("");
      unregister?.();
      player?.destroy();
      player = undefined;
      if (Date.now() < trackingUntil) track("youtube_player_error");
    }
    loadYouTubeAPI()
      .then((api) => {
        if (disposed) return;
        readyTimer = window.setTimeout(
          () =>
            failed(
              "YouTube is taking too long to load. Try again or use the link below.",
            ),
          20000,
        );
        player = new api.Player(mount, {
          videoId,
          width: "100%",
          height: "270",
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady({ target }) {
              if (disposed) return;
              unregister = registerYouTubePlayer(target);
              window.clearTimeout(readyTimer);
              target.getIframe().title = `YouTube player: ${title}`;
              target.getIframe().referrerPolicy =
                "strict-origin-when-cross-origin";
              setStatus("Ready. Press play in the YouTube player.");
              if (Date.now() < trackingUntil) track("youtube_player_ready");
            },
            onStateChange({ target, data }) {
              if (disposed) return;
              if (data === 1) {
                pauseAudioPreview();
                pauseOtherYouTubePlayers(target);
                setStatus("Playing on YouTube. Ads may play before the song.");
                if (Date.now() < trackingUntil) track("youtube_play_started");
              } else if (data === 2) setStatus("Paused.");
              else if (data === 3) {
                pauseAudioPreview();
                pauseOtherYouTubePlayers(target);
                setStatus("Buffering on YouTube…");
              } else if (data === 0) setStatus("Playback ended.");
            },
            onError({ data }) {
              failed(youtubeError(data));
            },
            onAutoplayBlocked() {
              if (!disposed)
                setStatus("Press play in the YouTube player to continue.");
            },
          },
        });
        player.getIframe().title = `YouTube player: ${title}`;
        player.getIframe().referrerPolicy = "strict-origin-when-cross-origin";
      })
      .catch(() =>
        failed(
          "YouTube could not load. Check your connection or use the link below.",
        ),
      );
    function onHidden() {
      if (document.visibilityState === "hidden" && unregister)
        player?.pauseVideo();
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      document.removeEventListener("visibilitychange", onHidden);
      unregister?.();
      player?.destroy();
      container.replaceChildren();
    };
  }, [enabled, attempt, videoId, title, trackingUntil]);

  return (
    <section
      className="video-preview"
      aria-label={`Watch or listen to ${title}`}
    >
      <p className="kicker">Watch / listen on Musicale</p>
      {!enabled ? (
        <>
          <p>
            Load a visible YouTube player, then press play. Loading it connects
            to YouTube, which may use cookies and show ads.
          </p>
          <p>
            By loading, you agree to our{" "}
            <Link href="/privacy">privacy policy</Link> and the{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube Terms of Service
            </a>
            .{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setEnabled(true)}
          >
            Load YouTube player
          </button>
        </>
      ) : null}
      <div
        className="video-host"
        ref={host}
        hidden={!enabled || Boolean(error)}
      />
      <p aria-live="polite" role={error || status ? "status" : undefined}>
        {error || status}
      </p>
      {error ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry YouTube player
        </button>
      ) : null}
      {enabled ? (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setEnabled(false);
            setError("");
            setStatus("");
          }}
        >
          Unload YouTube player
        </button>
      ) : null}
    </section>
  );
}
