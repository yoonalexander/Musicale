export const metadata = {
  title: "Sign in",
  description:
    "Request a one-time email link to save your Musicale vote, profile and streak.",
};
import { SignInForm } from "@/components/sign-in-form";
import { isDemoMode, getViewerState } from "@/lib/data";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const viewer = await getViewerState();
  return (
    <section className="auth">
      <p className="kicker">One link. No password.</p>
      <h1>Your music, remembered.</h1>
      <p>We’ll email you a secure, one-time sign-in link.</p>
      <p>
        Playing and ranking are free to enjoy without signing in. An account
        adds your history and profile.
      </p>
      {viewer.user?.isAnonymous ? (
        <p className="notice">
          A new account keeps this browser’s guest activity. An existing account
          loads its own history; guest activity isn’t automatically merged.
        </p>
      ) : null}
      <p>
        Open the newest email link, then press Confirm sign-in. Check spam if it
        doesn’t arrive.
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
