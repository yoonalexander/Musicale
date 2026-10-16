import type { ReactNode } from "react";
import type { RankSong } from "@/lib/rank";
import { SongListening } from "@/components/song-listening";
import { ArtworkCredit } from "@/components/artwork-credit";

export function SongChoice({
  song,
  children,
}: {
  song: RankSong;
  children: ReactNode;
}) {
  return (
    <article className="song-choice">
      <div className="art">
        {song.artworkUrl ? (
          <img
            src={song.artworkUrl}
            alt={`${song.title} artwork`}
            width="600"
            height="600"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden="true">{song.title[0]}</span>
        )}
      </div>
      <p className="kicker">
        {song.albumName} · {song.releaseYear}
        {song.genre ? ` · ${song.genre}` : ""}
      </p>
      <h2>{song.title}</h2>
      <p>{song.artistName}</p>
      <ArtworkCredit song={song} />
      <div className="card-actions">
        <SongListening song={song} />
        {children}
      </div>
    </article>
  );
}
