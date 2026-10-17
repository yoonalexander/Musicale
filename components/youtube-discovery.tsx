"use client";

import { useActionState } from "react";
import { discoverYouTube } from "@/app/actions";
import type { YouTubeVideo } from "@/lib/youtube-data";

export function YouTubeDiscovery({
  songId,
  onChoose,
}: {
  songId: string;
  onChoose: (id: string) => void;
}) {
  const [state, action, pending] = useActionState(
    discoverYouTube.bind(null, songId),
    { videos: [], error: "" },
  );
  return (
    <section aria-label="YouTube recording discovery">
      <h3>Find a YouTube recording</h3>
      <p>
        Results are candidates. Review the channel and recording version, choose
        an ID, then save the song below. YouTube metadata does not guarantee
        playback.
      </p>
      <form action={action} className="admin-form">
        <label>
          Playback country (two-letter code)
          <input
            name="region"
            defaultValue="CA"
            pattern="[A-Za-z]{2}"
            maxLength={2}
            required
          />
        </label>
        <button className="button secondary" disabled={pending}>
          {pending ? "Searching YouTube…" : "Search YouTube candidates"}
        </button>
      </form>
      {state.error ? <p role="alert">{state.error}</p> : null}
      <ul>
        {state.videos.map((video) => (
          <li key={video.id}>
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {video.title}
            </a>
            <p>
              {video.channel} · Duration: {video.duration || "unknown"} ·{" "}
              {video.embeddable ? "Embedding enabled" : "Embedding disabled"}
            </p>
            <p>
              {video.madeForKids === true
                ? "Made for Kids; Musicale player analytics disabled."
                : video.madeForKids === null
                  ? "Made for Kids status unavailable; Musicale player analytics disabled."
                  : "Not marked Made for Kids."}
            </p>
            {video.allowedRegions ? (
              <p>Allowed countries: {video.allowedRegions.join(", ")}</p>
            ) : null}
            {video.blockedRegions.length ? (
              <p>Blocked countries: {video.blockedRegions.join(", ")}</p>
            ) : null}
            <button
              type="button"
              className="button secondary"
              disabled={!video.embeddable}
              onClick={() => onChoose(video.id)}
            >
              Use video ID {video.id}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
