"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guestSession } from "@/components/guest-form";
import { prepareRank } from "@/app/rank/actions";
import { useSiteEntry } from "@/lib/site-entry";

export function AutoRank() {
  const entered = useSiteEntry();
  const started = useRef(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const load = useCallback(() => {
    startTransition(async () => {
      setError("");
      try {
        await guestSession();
        const result = await prepareRank();
        if (result.error) setError(result.error);
        else router.refresh();
      } catch {
        setError("Could not load your songs. Please try again.");
      }
    });
  }, [router, startTransition]);

  useEffect(() => {
    if (!entered || started.current) return;
    started.current = true;
    load();
  }, [entered, load]);

  return (
    <section className="panel" aria-busy={pending}>
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
        <p role="status">Finding your songs…</p>
      )}
    </section>
  );
}
