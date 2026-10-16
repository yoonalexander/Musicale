"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { saveSong } from "@/app/actions";
import type { Song } from "@/types/domain";
import { providerLabels } from "@/lib/providers";
export function CatalogEditor({ songs }: { songs: Song[] }) {
  const [id, setId] = useState("");
  const song = songs.find((s) => s.id === id);
  return (
    <section className="panel">
      <h2>Song editor</h2>
      <details>
        <summary>Open song editor</summary>
        <label>
          Edit a song or add a new one
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Add new song</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.artistName}
              </option>
            ))}
          </select>
        </label>
        <form key={id} action={saveSong} className="admin-form">
          <label>
            Song ID
            <input
              name="id"
              required
              maxLength={100}
              pattern={"[a-z0-9][a-z0-9\\-]*"}
              defaultValue={song?.id}
              readOnly={Boolean(song)}
            />
          </label>
          <label>
            Title
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={song?.title}
            />
          </label>
          <label>
            Artist
            <input
              name="artistName"
              required
              maxLength={200}
              defaultValue={song?.artistName}
            />
          </label>
          <label>
            Album
            <input
              name="albumName"
              maxLength={200}
              defaultValue={song?.albumName ?? "Single"}
            />
          </label>
          <label>
            Release year
            <input
              name="releaseYear"
              type="number"
              required
              min="1860"
              max="2200"
              defaultValue={song?.releaseYear}
            />
          </label>
          <label>
            Release date (optional)
            <input
              name="releaseDate"
              type="date"
              defaultValue={song?.releaseDate ?? ""}
            />
          </label>
          <label>
            Duration in milliseconds (optional)
            <input
              name="durationMs"
              type="number"
              min="1000"
              max="86400000"
              defaultValue={song?.durationMs ?? ""}
            />
          </label>
          <label>
            Genre
            <input
              name="genre"
              maxLength={100}
              defaultValue={song?.genre ?? ""}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={song?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="unavailable">Unavailable</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label>
            Artwork HTTPS URL (optional)
            <input
              name="artworkUrl"
              type="url"
              maxLength={2000}
              defaultValue={song?.artworkUrl ?? ""}
            />
          </label>
          <label className="checkbox-label">
            <input name="artworkPermission" type="checkbox" />I have permission
            to display this artwork.
          </label>
          <label>
            Artwork source HTTPS URL (optional)
            <input
              name="artworkSourceUrl"
              type="url"
              maxLength={2000}
              defaultValue={song?.artworkSourceUrl ?? ""}
            />
          </label>
          <label>
            Artwork attribution (optional)
            <input
              name="artworkAttribution"
              maxLength={1000}
              defaultValue={song?.artworkAttribution ?? ""}
            />
          </label>
          {(["youtube", "spotify", "apple_music", "musicbrainz"] as const).map(
            (provider) => {
              const p = song?.providers.find((p) => p.provider === provider);
              return (
                <fieldset key={provider}>
                  <legend>{providerLabels[provider]} (optional)</legend>
                  <label>
                    Provider ID
                    <input
                      name={`${provider}Id`}
                      maxLength={200}
                      defaultValue={p?.providerSongId}
                    />
                  </label>
                  <label>
                    Official HTTPS link
                    <input
                      name={`${provider}Url`}
                      type="url"
                      defaultValue={p?.externalUrl}
                    />
                  </label>
                </fieldset>
              );
            },
          )}
          <SubmitButton>Save song</SubmitButton>
        </form>
      </details>
    </section>
  );
}
