export function MusicLoading({
  label = "Loading…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`music-loading${compact ? " music-loading--compact" : ""}`}
      role={compact ? undefined : "status"}
      aria-atomic={compact ? undefined : true}
    >
      <span className="music-loading-disc" aria-hidden="true" />
      <span className="music-loading-label">{label}</span>
    </span>
  );
}
