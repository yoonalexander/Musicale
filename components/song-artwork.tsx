"use client";
import { useState } from "react";
export function SongArtwork({
  url,
  title,
  size = 600,
  decorative = false,
}: {
  url: string | null;
  title: string;
  size?: number;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return url && failed !== url ? (
    <img
      src={url}
      alt={decorative ? "" : `${title} album artwork`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
    />
  ) : (
    <span className={size === 48 ? "mini-art" : undefined} aria-hidden="true">
      {title[0]}
    </span>
  );
}
