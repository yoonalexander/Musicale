"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { guestSession } from "@/components/guest-form";
import { prepareRank } from "@/app/rank/actions";
import { useSiteEntry } from "@/lib/site-entry";
import { MusicLoading } from "@/components/music-loading";

export function AutoRank() {
  const entered = useSiteEntry();
  const started = useRef(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError("");
      try {
        await guestSession();
        const result = await prepareRank();
        if (result.error) setError(result.error);
      } catch {
        setError("Could not load your songs. Please try again.");
      }
    });
  }, [startTransition]);

  useEffect(() => {
    if (!entered || started.current) return;
    started.current = true;
    load();
  }, [entered, load]);

  return (
    <section className={error ? "panel" : undefined}>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            onClick={load}
            disabled={pending}
          >
            Try again
          </button>
        </>
      ) : (
        <MusicLoading label="Finding your songs…" />
      )}
    </section>
  );
}
