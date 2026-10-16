"use client";
import { useState, type FormEventHandler, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isAuthSessionMissingError } from "@supabase/supabase-js";

let starting: Promise<void> | null = null;
async function guestSession() {
  if (!starting)
    starting = (async () => {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("Guest play is unavailable in this preview.");
      const {
        data: { user },
        error: sessionError,
      } = await db.auth.getUser();
      if (sessionError && !isAuthSessionMissingError(sessionError))
        throw new Error(
          "Could not check your session. Retry shortly; your existing activity is preserved.",
        );
      if (!user) {
        const { error } = await db.auth.signInAnonymously();
        if (error)
          throw new Error(
            "Could not start guest play. Please retry shortly, or sign in.",
          );
      }
    })().finally(() => {
      starting = null;
    });
  return starting;
}
export function GuestForm({
  action,
  children,
  className,
  onSubmit,
}: {
  action: (form: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <form
        className={className}
        onSubmit={onSubmit}
        action={async (form) => {
          setError("");
          try {
            await guestSession();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Guest play is temporarily unavailable.",
            );
            return;
          }
          await action(form);
        }}
      >
        {children}
      </form>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
