export interface AudioPreview {
  provider: string;
  url: string | null;
  availability: "unknown" | "available" | "unavailable";
  licensingStatus: "unreviewed" | "authorized" | "rejected";
  authorizationUrl: string | null;
  attribution: string;
  startSeconds?: number;
  licenseUrl?: string | null;
  providerRecordingId?: string | null;
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
    audioUrl(preview.url) &&
    httpsUrl(preview.authorizationUrl) &&
    preview.provider.trim() &&
    preview.attribution.trim() &&
    Number.isFinite(preview.startSeconds ?? 0) &&
    (preview.startSeconds ?? 0) >= 0 &&
    (preview.startSeconds ?? 0) <= 86400 &&
    (!preview.licenseUrl || httpsUrl(preview.licenseUrl))
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
    startSeconds: Number(row.start_seconds ?? 0),
    licenseUrl: row.license_url ?? null,
    providerRecordingId: row.provider_recording_id ?? null,
  };
}
export function audioUrl(value: unknown): string | null {
  return typeof value === "string" && /^\/audio\/[a-z0-9-]+[.]mp3$/.test(value)
    ? value
    : httpsUrl(value);
}
