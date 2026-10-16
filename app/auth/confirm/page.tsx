import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSignInForm } from "@/components/sign-in-form";
import { isDemoMode } from "@/lib/data";
import { validEmailTokenHash } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Confirm sign-in",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConfirmSignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  const available = validEmailTokenHash(tokenHash) && !isDemoMode();
  return (
    <section className="auth">
      <p className="kicker">One link. No password.</p>
      <h1>
        {available ? "Confirm your sign-in." : "Request a new sign-in link."}
      </h1>
      {available ? (
        <>
          <p>Only continue if you requested this sign-in email.</p>
          <p>Your link is used when you press the button below.</p>
          <ConfirmSignInForm tokenHash={tokenHash} />
        </>
      ) : (
        <p className="notice" role="status">
          This sign-in link is unavailable.
        </p>
      )}
      <p>
        <Link href="/login">Request a new link</Link>
      </p>
    </section>
  );
}
