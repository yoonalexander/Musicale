import Link from "next/link";
export const metadata = {
  title: "Privacy and analytics",
  description:
    "How Musicale handles accounts, saved votes, optional analytics and external music providers.",
};
import { AnalyticsPreference } from "@/components/analytics";
import { YouTubePreference } from "@/components/youtube-consent";
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
        <h2>Music links and playback</h2>
        <p>
          Opening a music link takes you to its provider, where that provider’s
          terms and privacy policy apply. Explicitly authorized previews stream
          when you press play. Four explicitly CC BY licensed excerpts are
          served by Musicale with attribution; other approved external sources
          receive the playback request directly. Musicale does not proxy or copy
          commercial recordings without permission.
        </p>
      </section>
      <section className="panel">
        <h2>Questions about your data?</h2>
        <p>
          <Link href="/help">Contact and help</Link> explains how to request
          assistance. Public song rankings and aggregate counts do not include
          your account identity.
        </p>
        <h2>Welcome screen</h2>
        <p>
          Before music pages open, the welcome overlay explains YouTube loading
          and asks you to choose Play. This acknowledgement lasts for this
          browser tab's session. Direct links show the same notice, and gameplay
          stays at the URL you opened. Privacy and Help remain accessible before
          entry. If session storage is unavailable, a reload shows the notice
          again.
        </p>
        <h2>YouTube players</h2>
        <p>
          Musicale uses the YouTube IFrame Player API. Choosing Play on the
          welcome overlay enables automatic player loading across Musicale. This
          choice is saved in this browser’s local storage, or just for the
          current visit if storage is unavailable. Until you enable it, players
          load only when you choose “Load YouTube player”. Loading connects your
          browser directly to YouTube and Google, which receive information such
          as your IP address, browser details and site origin. They may access
          cookies or similar device storage, serve ads, and process playback
          activity under the{" "}
          <a href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>
          . You can unload each player at any time.
        </p>
        <p>
          By using these players you agree to the{" "}
          <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>
          . Musicale does not request access to your Google account or YouTube
          credentials. Optional Musicale analytics count player ready,
          play-state and error events in aggregate only when recent metadata
          explicitly identifies the video as not Made for Kids. Player tracking
          stays off for unknown, stale or Made for Kids sources. These events do
          not prove audible music or any listening duration. The server uses the
          YouTube Data API to check public video metadata; your browser does not
          receive the server API key.
        </p>
      </section>
      <YouTubePreference />
      <AnalyticsPreference />
    </section>
  );
}
