"use client";

import { useSyncExternalStore } from "react";

const key = "musicale-youtube-consent-v1";
const changed = "musicale-youtube-consent-changed";
let allowedThisVisit: boolean | undefined;

function read() {
  if (allowedThisVisit !== undefined) return allowedThisVisit;
  try {
    return localStorage.getItem(key) === "yes";
  } catch {
    return false;
  }
}

export function saveYouTubeConsent(allowed: boolean) {
  allowedThisVisit = allowed;
  let saved = false;
  try {
    localStorage.setItem(key, allowed ? "yes" : "no");
    saved = true;
  } catch {
    // Storage-blocked browsers retain the choice only for this visit.
  }
  window.dispatchEvent(new Event(changed));
  return saved;
}

export function enableYouTubeOnEntry() {
  if (allowedThisVisit === false) return;
  try {
    if (localStorage.getItem(key) === "no") return;
  } catch {}
  saveYouTubeConsent(true);
}

function subscribe(update: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return;
    allowedThisVisit = event.newValue === "yes";
    update();
  }
  window.addEventListener(changed, update);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changed, update);
    window.removeEventListener("storage", onStorage);
  };
}

export function useYouTubeConsent() {
  return useSyncExternalStore(subscribe, read, () => false);
}
