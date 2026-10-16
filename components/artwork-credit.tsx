import type { Song } from "@/types/domain";
export function ArtworkCredit({ song }: { song: Song }) {
  if (!song.artworkUrl || (!song.artworkSourceUrl && !song.artworkAttribution))
    return null;
  return (
    <p>
      {song.artworkAttribution}
      {song.artworkSourceUrl ? (
        <>
          {" "}
          ·{" "}
          <a
            href={song.artworkSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Artwork source
          </a>
        </>
      ) : null}
    </p>
  );
}
