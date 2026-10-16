import Link from "next/link";
import { signOutAction } from "@/app/actions";
import type { ViewerState } from "@/types/domain";
import { isDemoMode } from "@/lib/data";
export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer: ViewerState;
}) {
  return (
    <>
      <a className="skip-link" href="#main-content" tabIndex={0}>
        Skip to content
      </a>
      <header className="site-header">
        <Link className="wordmark" href="/">
          Musicale
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/play">Play</Link>
          <Link href="/rank">Rank</Link>
          <Link href="/today">Daily</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          {viewer.user && !viewer.user.isAnonymous ? (
            <Link href="/profile">Profile</Link>
          ) : null}
          {viewer.isAdmin ? <Link href="/admin">Admin</Link> : null}
        </nav>
        {viewer.user && !viewer.user.isAnonymous ? (
          <form action={signOutAction}>
            <button className="text-button">Sign out</button>
          </form>
        ) : (
          <Link className="button small" href="/login">
            Sign in
          </Link>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {isDemoMode() ? (
          <p className="notice" role="status">
            Preview catalog — sign-in and persistent voting are disabled.
          </p>
        ) : null}
        {children}
      </main>
      <footer>
        <span>Musicale</span>
        <span>Music playback remains with its provider.</span>
        <Link href="/archive">Featured matchups</Link>
        <Link href="/privacy">Privacy & analytics</Link>
        <Link href="/help">Help & contact</Link>
      </footer>
    </>
  );
}
