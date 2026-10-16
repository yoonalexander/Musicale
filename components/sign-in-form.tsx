"use client";

import { useFormStatus } from "react-dom";
import { confirmEmailSignIn, requestMagicLinkAction } from "@/app/actions";

function SubmitButton({
  disabled = false,
  label,
  pendingLabel,
}: {
  disabled?: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : label}
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
      <SubmitButton
        disabled={disabled}
        label="Send magic link"
        pendingLabel="Sending link…"
      />
    </form>
  );
}

export function ConfirmSignInForm({ tokenHash }: { tokenHash: string }) {
  return (
    <form action={confirmEmailSignIn}>
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <SubmitButton label="Confirm sign-in" pendingLabel="Signing in…" />
    </form>
  );
}
