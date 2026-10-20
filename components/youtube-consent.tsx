"use client";

import Link from "next/link";
import { useState } from "react";
import { GuestForm } from "@/components/guest-form";
import { SubmitButton } from "@/components/submit-button";
import {
  enableYouTubeOnEntry,
  saveYouTubeConsent,
  useYouTubeConsent,
} from "@/lib/youtube-consent";

export function YouTubePlayEntry({
  action,
  startRun,
  returnTo,
}: {
  action: (form: FormData) => Promise<void>;
  startRun: boolean;
  returnTo: string;
}) {
  const Form = startRun ? GuestForm : "form";
  return (
    <>
      <Form
        action={action}
        className="welcome-start"
        onSubmit={enableYouTubeOnEntry}
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        <SubmitButton
          busyText="Getting your songs…"
          aria-describedby="youtube-entry-notice"
        >
          Play <span aria-hidden="true">↗</span>
        </SubmitButton>
      </Form>
      <p className="youtube-consent-notice" id="youtube-entry-notice">
        By choosing Play, you allow YouTube players to load automatically across
        Musicale unless you’ve turned this off in Privacy, and agree to the{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>.
        YouTube may use cookies and show ads. Read{" "}
        <a href="https://policies.google.com/privacy">
          Google’s Privacy Policy
        </a>{" "}
        and <Link href="/privacy">our Privacy Policy</Link>, where you can
        change this choice. Optional analytics stay separate.
      </p>
    </>
  );
}

export function YouTubePreference() {
  const allowed = useYouTubeConsent();
  const [status, setStatus] = useState("");
  return (
    <section className="panel">
      <h2>YouTube player preference</h2>
      <p>
        Save time by loading players automatically in Play, Rank and song pages.
        Videos still wait for you to press play. Turning this off unloads open
        players in your Musicale tabs; you can still load a player manually.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={allowed}
          onChange={(event) => {
            const saved = saveYouTubeConsent(event.target.checked);
            setStatus(
              saved
                ? "Preference saved on this browser."
                : "Preference changed for this visit. This browser could not save it.",
            );
          }}
        />
        Allow YouTube players to load automatically
      </label>
      <p role="status">{status}</p>
    </section>
  );
}
