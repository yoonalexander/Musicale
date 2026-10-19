import {
  chooseMetadata,
  metadataApi,
  type MetadataCandidate,
} from "./metadata-enrichment.ts";

export async function runMetadataJob(
  db: any,
  songId: string | null = null,
  selection?: { recordingId: string; releaseId?: string },
) {
  const { data: job, error } = await db.rpc("claim_song_metadata", {
    p_song_id: songId,
  });
  if (error) throw new Error("Could not claim metadata work.");
  if (!job) return { status: "idle" };
  const api = metadataApi(async () => {
    for (let i = 0; i < 20; i++) {
      const slot = await db.rpc("reserve_catalog_provider_call");
      if (slot.error) throw new Error("Metadata request reservation failed.");
      if (slot.data) return;
      await new Promise((r) => setTimeout(r, 1100));
    }
    throw new Error("Metadata provider is busy.");
  });
  let candidates: MetadataCandidate[] = Array.isArray(job.candidates)
      ? job.candidates
      : [],
    selected: MetadataCandidate | null = null,
    failure: string | null = null;
  let status = "failed";
  try {
    const previous = job.song.metadata_details;
    if (!selection && previous?.reviewedByAdmin)
      selection = {
        recordingId: previous.recordingId,
        releaseId: previous.releaseId,
      };
    if (selection) {
      selected = await api.lookup(
        job.song,
        selection.recordingId,
        selection.releaseId,
      );
      if (!selected) {
        status = "review";
        throw new Error(
          "The selected recording and edition could not be verified. Choose another candidate or refresh metadata.",
        );
      }
      Object.assign(selected, { reviewedByAdmin: true });
      candidates = [selected];
    } else if (job.song.recording_id || previous?.recordingId) {
      const identified = await api.lookup(
        job.song,
        job.song.recording_id ?? previous.recordingId,
        previous?.releaseId,
      );
      candidates = identified ? [identified] : [];
      selected =
        identified &&
        !identified.requiresReview &&
        identified.confidence >= 0.96
          ? identified
          : null;
    } else {
      const result = await api.search(job.song);
      candidates = result.candidates;
      const choice = chooseMetadata(candidates, result.truncated);
      if (choice) {
        const detailed = await api.lookup(
          job.song,
          choice.recordingId,
          choice.releaseId,
        );
        selected =
          detailed && !detailed.requiresReview && detailed.confidence >= 0.96
            ? detailed
            : null;
      }
    }
    if (selected) {
      try {
        selected.artwork = await api.artwork(selected);
      } catch (error) {
        selected.artwork =
          previous?.releaseId === selected.releaseId ? previous.artwork : null;
        failure = `Artwork lookup failed: ${error instanceof Error ? error.message : "Provider unavailable"}`;
      }
      candidates = [
        selected,
        ...candidates.filter((c) => c.recordingId !== selected!.recordingId),
      ].slice(0, 20);
    }
    status = selected
      ? failure
        ? "failed"
        : "enriched"
      : candidates.length
        ? "review"
        : "unmatched";
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "Metadata lookup failed.";
  }
  const saved = await db.rpc("finish_song_metadata", {
    p_song_id: job.song.id,
    p_lease: job.lease,
    p_status: status,
    p_candidates: candidates.slice(0, 20),
    p_selected: selected,
    p_error: failure,
  });
  if (saved.error)
    throw new Error(
      "Could not save metadata work; its lease will expire for retry.",
    );
  return {
    songId: job.song.id,
    status,
    metadataSaved: selected !== null,
    error: selected ? null : failure,
    warning:
      selected && failure
        ? "Recording match saved. Artwork lookup failed; retry artwork without reviewing this match again."
        : null,
  };
}
