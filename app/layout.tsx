import { getSiteUrl } from "@/lib/env";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getViewerState } from "@/lib/data";
import { AnalyticsTracker } from "@/components/analytics";
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  openGraph: {
    type: "website",
    siteName: "Musicale",
    title: "Musicale — Two songs. One good instinct.",
    description:
      "Guess the higher-rated song or rank your favorites. Play without signing up.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Musicale",
    description: "Every day. Two songs. One choice.",
  },
  title: {
    default: "Musicale — Two songs. One good instinct.",
    template: "%s — Musicale",
  },
  description:
    "Play the music guessing game, rank your favorites, and discover the community leaderboard. No sign-up needed.",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewerState();
  return (
    <html lang="en">
      <body>
        <AppShell viewer={viewer}>{children}</AppShell>
        <AnalyticsTracker />
      </body>
    </html>
  );
}
