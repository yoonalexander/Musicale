"use client";

import { useFormStatus } from "react-dom";
import { requestMagicLinkAction } from "@/app/actions";

function SendLinkButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? "Sending link…" : "Send magic link"}
    </button>
  );
}

export function SignInForm({ disabled }: { disabled: boolean }) {
  return (
    <form action={requestMagicLinkAction}>
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          placeholder="you@example.com"
        />
      </label>
      <SendLinkButton disabled={disabled} />
    </form>
  );
}
