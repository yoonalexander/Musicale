export interface AudioPreview {
  provider: string;
  url: string | null;
  availability: "unknown" | "available" | "unavailable";
  licensingStatus: "unreviewed" | "authorized" | "rejected";
  authorizationUrl: string | null;
  attribution: string;
}
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function playablePreview(preview: AudioPreview | null | undefined) {
  return preview?.availability === "available" &&
    preview.licensingStatus === "authorized" &&
    httpsUrl(preview.url) &&
    httpsUrl(preview.authorizationUrl) &&
    preview.provider.trim() &&
    preview.attribution.trim()
    ? preview
    : null;
}
export function mapAudio(
  row: Record<string, any> | null | undefined,
): AudioPreview | null {
  if (!row) return null;
  return {
    provider: String(row.provider ?? ""),
    url: row.url ?? null,
    availability: row.availability,
    licensingStatus: row.licensing_status,
    authorizationUrl: row.authorization_url ?? null,
    attribution: String(row.attribution ?? ""),
  };
}
