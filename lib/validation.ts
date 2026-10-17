import { safeProviderUrl } from "@/lib/providers";
import type { SongProvider } from "@/types/domain";
import { httpsUrl } from "./audio";

export function validDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function utcWindow(day: string) {
  if (!validDay(day)) throw new Error("Enter a valid calendar date.");
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { starts_at: `${day}T00:00:00Z`, ends_at: next.toISOString() };
}
export function songId(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(value))
    throw new Error(
      "Song IDs use lowercase letters, numbers and hyphens (up to 100 characters).",
    );
  return value;
}
export interface SongInput {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  releaseYear: number;
  genre: string | null;
  status: "active" | "unavailable" | "disabled";
  providers: SongProvider[];
  releaseDate: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
  artworkSourceUrl?: string | null;
  artworkAttribution?: string | null;
}
export function validateSong(value: unknown): SongInput {
  if (!value || typeof value !== "object")
    throw new Error("Each song must be an object.");
  const r = value as Record<string, unknown>;
  const title = String(r.title ?? "").trim(),
    artistName = String(r.artistName ?? "").trim();
  if (!title || title.length > 200 || !artistName || artistName.length > 200)
    throw new Error("Title and artist are required (up to 200 characters).");
  const releaseYear = Number(r.releaseYear);
  if (
    !Number.isInteger(releaseYear) ||
    releaseYear < 1860 ||
    releaseYear > 2200
  )
    throw new Error("Enter a release year between 1860 and 2200.");
  const status = r.status ?? "active";
  if (!["active", "unavailable", "disabled"].includes(String(status)))
    throw new Error("Invalid song status.");
  const providers = Array.isArray(r.providers)
    ? r.providers.map((p) => {
        if (!p || typeof p !== "object")
          throw new Error(
            "Each provider must include an ID and official link.",
          );
        const url = safeProviderUrl(p.provider, p.externalUrl);
        const id = String(p.providerSongId ?? "").trim();
        if (!url || !id || id.length > 200)
          throw new Error(
            "Providers need a valid ID and HTTPS link on their official domain.",
          );
        return {
          provider: p.provider,
          providerSongId: id,
          externalUrl: url,
        } as SongProvider;
      })
    : [];
  if (new Set(providers.map((p) => p.provider)).size !== providers.length)
    throw new Error("Use each provider only once per song.");
  if (providers.length > 4)
    throw new Error("Use up to four supported providers.");
  const releaseDate = r.releaseDate ? String(r.releaseDate) : null;
  if (
    releaseDate &&
    (!validDay(releaseDate) || Number(releaseDate.slice(0, 4)) !== releaseYear)
  )
    throw new Error(
      "Release date must be a real date matching the release year.",
    );
  const durationMs =
    r.durationMs === undefined || r.durationMs === null || r.durationMs === ""
      ? null
      : Number(r.durationMs);
  if (
    durationMs !== null &&
    (!Number.isInteger(durationMs) ||
      durationMs < 1000 ||
      durationMs > 86400000)
  )
    throw new Error("Duration must be between 1 second and 24 hours.");
  const artworkUrl = r.artworkUrl ? String(r.artworkUrl).trim() : null;
  if (artworkUrl) {
    let url: URL;
    try {
      url = new URL(artworkUrl);
    } catch {
      throw new Error("Artwork needs a valid HTTPS URL.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      artworkUrl.length > 2000
    )
      throw new Error("Artwork needs a valid HTTPS URL without credentials.");
  }
  const artworkSourceUrl = r.artworkSourceUrl
    ? httpsUrl(r.artworkSourceUrl)
    : artworkUrl;
  if (r.artworkSourceUrl && !artworkSourceUrl)
    throw new Error("Artwork source needs a valid HTTPS URL.");
  const artworkAttribution = String(r.artworkAttribution ?? "").trim();
  if (artworkAttribution.length > 1000)
    throw new Error("Artwork attribution must be at most 1000 characters.");
  return {
    id: songId(String(r.id ?? "")),
    title,
    artistName,
    albumName: String(r.albumName ?? "Single").slice(0, 200),
    releaseYear,
    genre: r.genre ? String(r.genre).slice(0, 100) : null,
    status: status as SongInput["status"],
    providers,
    releaseDate,
    durationMs,
    artworkUrl,
    artworkSourceUrl: artworkUrl ? artworkSourceUrl : null,
    artworkAttribution: artworkUrl ? artworkAttribution || null : null,
  };
}
export function validEmailTokenHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 512 &&
    !/[^A-Za-z0-9_-]/.test(value)
  );
}
