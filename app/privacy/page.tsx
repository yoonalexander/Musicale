import Link from "next/link";
export const metadata = {
  title: "Privacy and analytics",
  description:
    "How Musicale handles accounts, saved votes, optional analytics and external music providers.",
};
import { AnalyticsPreference } from "@/components/analytics";
export default function Privacy() {
  return (
    <section className="page">
      <header className="page-title">
        <p className="kicker">Your data</p>
        <h1>Privacy at Musicale</h1>
      </header>
      <section className="panel">
        <h2>Accounts and votes</h2>
        <p>
          Supabase handles email sign-in and session cookies. Musicale stores
          your display name, account ID, vote history and participation streaks.
          Votes are permanent: their recorded rating changes form the
          leaderboard’s audit trail. Your profile and vote history are visible
          to you and authorized administrators.
        </p>
        <h2>Security and operations</h2>
        <p>
          Authenticated request counters protect sensitive actions and let
          administrators review unusual volume. Counters older than seven days
          are removed on the next request. Musicale does not store raw IP
          addresses. Hosting and authentication providers may keep their own
          operational logs under their policies.
        </p>
        <h2>Music links and artwork</h2>
        <p>
          Opening a music link takes you to its provider, where that provider’s
          terms and privacy policy apply. No music players load automatically.
          If supplied by an editor, artwork loads from its source; that host
          receives the image request. We suppress the referrer on artwork
          requests.
        </p>
      </section>
      <section className="panel">
        <h2>Questions about your data?</h2>
        <p>
          <Link href="/help">Contact and help</Link> explains how to request
          assistance. Public song rankings and aggregate counts do not include
          your account identity.
        </p>
      </section>
      <AnalyticsPreference />
    </section>
  );
}
