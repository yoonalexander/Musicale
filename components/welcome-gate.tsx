"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { YouTubePlayEntry } from "@/components/youtube-consent";
import { SiteEntryContext } from "@/lib/site-entry";

const entryKey = "musicale-entry-session-v1";
let enteredThisVisit = false;

export function WelcomeGate({
  children,
  demo,
}: {
  children: ReactNode;
  demo: boolean;
}) {
  const pathname = usePathname();
  const [entered, setEntered] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    try {
      enteredThisVisit ||= sessionStorage.getItem(entryKey) === "yes";
    } catch {}
    setEntered(enteredThisVisit);
    setChecked(true);
  }, []);
  const musicPage =
    pathname === "/" ||
    ["/play", "/rank", "/today", "/songs", "/leaderboard", "/archive"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  const blocked = !entered && musicPage;
  return (
    <SiteEntryContext.Provider value={entered}>
      {/* Preserve server responses and form state while music is inaccessible. */}
      <div hidden={blocked} inert={blocked}>
        {children}
      </div>
      {blocked ? (
        <WelcomeOverlay
          active={checked}
          startRun={!demo && (pathname === "/" || pathname === "/play")}
          returnTo={pathname === "/" ? "/" : "/play"}
          enter={() => {
            enteredThisVisit = true;
            try {
              sessionStorage.setItem(entryKey, "yes");
            } catch {}
            setEntered(true);
          }}
        />
      ) : null}
    </SiteEntryContext.Provider>
  );
}

function WelcomeOverlay({
  active,
  startRun,
  returnTo,
  enter,
}: {
  active: boolean;
  startRun: boolean;
  returnTo: "/" | "/play";
  enter: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!active) return;
    const modal = dialog.current;
    modal?.close();
    modal?.showModal();
    return () => modal?.close();
  }, [active]);
  const date = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
  return (
    <dialog
      ref={dialog}
      open
      aria-modal="true"
      className="game-welcome welcome-overlay"
      aria-labelledby="welcome-title"
      aria-describedby="youtube-entry-notice"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="welcome-inner">
        <div className="music-mark" aria-hidden="true">
          <svg viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r="29"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="40"
              cy="40"
              r="19"
              stroke="currentColor"
              strokeWidth="1"
              opacity=".35"
            />
            <path
              d="M34 29v24m12-30v24m-24-9v10m36-19v10"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="kicker">Your daily dose of music instinct</p>
        <h1 id="welcome-title">
          Musicale<span aria-hidden="true">.</span>
        </h1>
        <p className="welcome-promise">
          Two songs.
          <br />
          One good instinct.
        </p>
        <p className="welcome-description">
          Pick the higher-rated song.
          <br />
          See how far your taste takes you.
        </p>
        <YouTubePlayEntry
          startRun={startRun}
          returnTo={returnTo}
          action={async () => enter()}
        />
        <noscript>
          Enable JavaScript to enter Musicale and use its players.
        </noscript>
        <p className="welcome-reassurance">
          No sign-up. Unlimited runs. Just music.
        </p>
        <div className="welcome-alternatives">
          <Link href="/privacy">Privacy & preferences</Link>
          <Link href="/help">Help & music credits</Link>
        </div>
        <p className="welcome-date">
          <time>{date}</time>
          <span>A little music, every day.</span>
        </p>
      </div>
    </dialog>
  );
}
