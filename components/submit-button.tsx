"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({
  children,
  busyText = "Saving…",
  className = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  busyText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? busyText : children}
    </button>
  );
}
