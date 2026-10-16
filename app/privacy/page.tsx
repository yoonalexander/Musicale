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
          leaderboard’s audit trail. Rank also stores your issued song pairs,
          their expiry and saved preferences. Rank activity does not change
          Daily streaks. Your profile and vote history are visible to you and
          authorized administrators.
        </p>
        <h2>Guest play</h2>
        <p>
          Playing or voting without an email creates a private guest session
          with Supabase. It uses essential session cookies and a player ID, so
          votes and scores can be protected and resumed. Clearing browser data
          or using another browser loses access to that guest session. A
          verified new email can keep its activity on the same account; an
          existing account keeps its own history. Guest votes remain part of the
          ranking audit trail. We also store a local preference recording
          whether you dismissed the tutorial.
        </p>
        <h2>Play runs</h2>
        <p>
          Musicale saves your private game runs, issued song pairs, rating
          snapshots, guesses and scores. Pending answers are withheld until
          graded. Public song ratings can still be viewed elsewhere; Play is a
          casual game with no competitive scoreboard. Your run is available
          through your own guest or signed-in session and trusted database
          operations.
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
          terms and privacy policy apply. Explicitly authorized previews stream
          directly from their source when you press play; that host receives the
          playback request. Musicale does not proxy, download or rehost audio.
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
