"use client";
import { useRef, useState } from "react";
import type { Song } from "@/types/domain";
import { providerLabels } from "@/lib/providers";
import { playablePreview } from "@/lib/audio";
import { track } from "@/lib/analytics";

export function SongListening({ song }: { song: Song }) {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const preview = playablePreview(song.audioPreview);
  return (
    <>
      {preview && !failed ? (
        <div>
          <audio
            controls
            preload="none"
            aria-label={`Preview ${song.title}`}
            src={preview.url!}
            onPlaying={() => {
              if (!started.current) {
                started.current = true;
                track("preview_play_started");
              }
            }}
            onError={() => {
              setFailed(true);
              track("preview_play_failed");
            }}
          />
          <p>
            {preview.attribution} ·{" "}
            <a
              href={preview.authorizationUrl!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Audio authorization
            </a>
          </p>
        </div>
      ) : null}
      {failed ? (
        <p role="status">Preview unavailable. Try a listening link below.</p>
      ) : null}
      {song.providers.map((p) => (
        <a
          key={p.provider}
          className="button secondary"
          href={p.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (p.provider !== "musicbrainz") track("listening_link_clicked");
          }}
        >
          {p.provider === "musicbrainz" ? "View on" : "Listen on"}{" "}
          {providerLabels[p.provider]}
        </a>
      ))}
      {!preview && !song.providers.some((p) => p.provider !== "musicbrainz") ? (
        <span>Playback unavailable</span>
      ) : null}
    </>
  );
}
