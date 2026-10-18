"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({
  children,
  busyText = "Saving…",
  className = "button",
  disabled = false,
  "aria-describedby": describedBy,
}: {
  children: React.ReactNode;
  busyText?: string;
  className?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
      aria-describedby={describedBy}
    >
      {pending ? busyText : children}
    </button>
  );
}
