"use client";
import type { Song } from "@/types/domain";
import { providerLabels } from "@/lib/providers";
import { playablePreview } from "@/lib/audio";
import { track } from "@/lib/analytics";
import { AudioPreviewPlayer } from "@/components/audio-preview-player";
import { SongVideoPreview } from "@/components/song-video-preview";
import { canTrackYouTube, youtubeVideoId } from "@/lib/youtube";

export function SongListening({
  song,
}: {
  song: Pick<
    Song,
    | "id"
    | "title"
    | "artistName"
    | "providers"
    | "audioPreview"
    | "youtubeValidation"
  >;
}) {
  const preview = playablePreview(song.audioPreview);
  return (
    <>
      <SongVideoPreview song={song} />
      {preview ? (
        <div>
          <AudioPreviewPlayer
            key={`${song.id}:${preview.url}:${preview.startSeconds ?? 0}`}
            title={song.title}
            preview={preview}
          />
          <details className="audio-credit">
            <summary>Audio credits & license</summary>
            <p>
              {preview.attribution} ·{" "}
              <a
                href={preview.authorizationUrl!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Audio authorization
              </a>
              {preview.licenseUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={preview.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    License
                  </a>
                </>
              ) : null}
              <span> · 15-second excerpt.</span>
            </p>
          </details>
        </div>
      ) : null}
      {song.providers.map((p) => (
        <a
          key={p.provider}
          className="button secondary"
          href={p.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (p.provider === "youtube") {
              const id = youtubeVideoId(p.externalUrl);
              if (id && canTrackYouTube(song, id))
                track("listening_link_clicked");
            } else if (p.provider !== "musicbrainz")
              track("listening_link_clicked");
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
