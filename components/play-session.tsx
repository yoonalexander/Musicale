"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { guestSession } from "@/components/guest-form";
import { prepareFreshPlay } from "@/app/play/actions";
import { useSiteEntry } from "@/lib/site-entry";

const SessionContext = createContext<{
  start: () => void;
  pending: boolean;
} | null>(null);

export function PlaySession({
  runId,
  children,
}: {
  runId?: string;
  children: ReactNode;
}) {
  const entered = useSiteEntry();
  const visit = useRef<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const prepare = useCallback(
    (id: string) => {
      visit.current = id;
      setRequested(id);
      setError("");
      startTransition(async () => {
        try {
          await guestSession();
          const result = await prepareFreshPlay(id);
          if (result.error) setError(result.error);
          else router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not start your run. Please try again.",
          );
        }
      });
    },
    [router],
  );
  const start = useCallback(() => prepare(crypto.randomUUID()), [prepare]);

  useEffect(() => {
    if (entered && !visit.current) start();
  }, [entered, start]);
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted && entered) start();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [entered, start]);

  return (
    <SessionContext.Provider value={{ start, pending }}>
      {error ? (
        <section className="today game-stage">
          <h1>Start a new run</h1>
          <p className="notice" role="alert">
            {error}
          </p>
          <button className="button" disabled={pending} onClick={start}>
            Try again
          </button>
        </section>
      ) : requested === runId ? (
        children
      ) : (
        <section className="today game-stage" aria-busy="true">
          <h1>Which song is higher rated?</h1>
          <p role="status">Getting your songs…</p>
        </section>
      )}
    </SessionContext.Provider>
  );
}

export function NewPlayButton({ children }: { children: ReactNode }) {
  const session = useContext(SessionContext);
  return (
    <button
      className="button"
      disabled={!session || session.pending}
      onClick={session?.start}
    >
      {session?.pending ? "Getting your songs…" : children}
    </button>
  );
}
