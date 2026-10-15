import { SignInForm } from "@/components/sign-in-form";
import { isDemoMode } from "@/lib/data";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <section className="auth">
      <p className="kicker">One link. No password.</p>
      <h1>Keep your vote and your streak.</h1>
      <p>We’ll email you a secure, one-time sign-in link.</p>
      <p>
        Open the newest link in this browser. Check spam if it doesn’t arrive.
      </p>
      {p.message ? (
        <div className="notice" role="status">
          {p.message}
        </div>
      ) : null}
      {isDemoMode() ? (
        <div className="notice">
          Supabase is not configured in this environment.
        </div>
      ) : null}
      <SignInForm disabled={isDemoMode()} />
    </section>
  );
}
