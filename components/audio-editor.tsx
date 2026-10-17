"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveAudioSource,
  discoverAuthorizedAudio,
  importOpenMusic,
} from "@/app/catalog-actions";
import type { AudioPreview } from "@/lib/audio";
import type { Song } from "@/types/domain";
export function AudioEditor({
  songs,
  audio,
}: {
  songs: Song[];
  audio: (AudioPreview & { songId: string })[];
}) {
  const [id, setId] = useState(songs[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const current = audio.find((a) => a.songId === id);
  return (
    <section className="panel">
      <h2>Audio availability and authorization</h2>
      <p>
        External listening links remain available independently. Only approve an
        audio URL when you have explicit authorization for playback within
        Musicale. Public access or provider metadata does not grant permission.
      </p>
      <p>
        Reviewed Wikimedia Commons recordings can be matched automatically by
        recording ID, ISRC, or exact recording metadata. Unsupported songs keep
        their external links.
      </p>
      <div className="share-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const r = await discoverAuthorizedAudio();
              setMessage(r.error ?? r.message);
              router.refresh();
            } catch {
              setMessage(
                "Discovery failed. Saved catalog data is unchanged; retry shortly.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Discover authorized previews
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const r = await importOpenMusic();
              setMessage(r.error ?? r.message);
              router.refresh();
            } catch {
              setMessage(
                "Import could not be confirmed. Retry the same pack safely.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Import four open-license recordings
        </button>
      </div>
      <p role="status">{message}</p>
      <details>
        <summary>Review audio sources</summary>
        <label>
          Song for audio review
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setMessage("");
            }}
          >
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.artistName}
              </option>
            ))}
          </select>
        </label>
        <p>
          Current audio: {current?.availability ?? "unknown"}; permission:{" "}
          {current?.licensingStatus ?? "unreviewed"}.
        </p>
        <form
          key={id}
          className="admin-form"
          onChange={(e) => {
            if (
              e.target instanceof HTMLInputElement &&
              ["url", "provider", "authorizationUrl"].includes(e.target.name)
            ) {
              const confirmation = e.currentTarget.elements.namedItem(
                "confirmAuthorization",
              ) as HTMLInputElement;
              confirmation.checked = false;
            }
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setPending(true);
            try {
              const result = await saveAudioSource(form);
              setMessage(result.error ?? "Audio source saved.");
              if (!result.error) router.refresh();
            } catch {
              setMessage("Audio request failed. Please retry.");
            } finally {
              setPending(false);
            }
          }}
        >
          <input type="hidden" name="songId" value={id} />
          <label>
            Audio provider
            <input
              name="provider"
              required
              maxLength={100}
              defaultValue={current?.provider ?? ""}
            />
          </label>
          <label>
            Audio HTTPS URL
            <input
              name="url"
              type="text"
              inputMode="url"
              maxLength={2000}
              defaultValue={current?.url ?? ""}
            />
          </label>
          <label>
            Audio availability
            <select
              name="availability"
              defaultValue={current?.availability ?? "unknown"}
            >
              <option value="unknown">Unknown</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
          <label>
            Audio licensing status
            <select
              name="licensingStatus"
              defaultValue={current?.licensingStatus ?? "unreviewed"}
            >
              <option value="unreviewed">Unreviewed</option>
              <option value="authorized">Authorized for Musicale</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label>
            Authorization evidence HTTPS URL
            <input
              name="authorizationUrl"
              type="url"
              maxLength={2000}
              defaultValue={current?.authorizationUrl ?? ""}
            />
          </label>
          <label>
            Snippet start (seconds)
            <input
              name="startSeconds"
              type="number"
              min="0"
              max="86400"
              step="0.1"
              defaultValue={current?.startSeconds ?? 0}
            />
          </label>
          <label>
            License HTTPS URL (optional)
            <input
              name="licenseUrl"
              type="url"
              maxLength={2000}
              defaultValue={current?.licenseUrl ?? ""}
            />
          </label>
          <label>
            Audio attribution
            <input
              name="attribution"
              maxLength={1000}
              defaultValue={current?.attribution ?? ""}
            />
          </label>
          <label className="checkbox-label">
            <input name="confirmAuthorization" type="checkbox" />I verified
            explicit permission for this source to play within Musicale.
          </label>
          <button className="button" disabled={pending || !id}>
            {pending ? "Saving…" : "Save audio source"}
          </button>
        </form>
      </details>
    </section>
  );
}
