import type { ReactNode } from "react";
import type { RankSong } from "@/lib/rank";
import { SongListening } from "@/components/song-listening";

export function SongChoice({
  song,
  children,
}: {
  song: RankSong;
  children: ReactNode;
}) {
  return (
    <article className="song-choice">
      <p className="kicker">
        {song.albumName} · {song.releaseYear}
        {song.genre ? ` · ${song.genre}` : ""}
      </p>
      <h2>{song.title}</h2>
      <p>{song.artistName}</p>
      <div className="card-actions">
        <SongListening song={song} />
        {children}
      </div>
    </article>
  );
}
