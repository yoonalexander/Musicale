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
    title: "Musicale — Every day. Two songs. One choice.",
    description:
      "One shared daily matchup. Listen, choose, and build an auditable music leaderboard.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Musicale",
    description: "Every day. Two songs. One choice.",
  },
  title: {
    default: "Musicale — Every day. Two songs. One choice.",
    template: "%s — Musicale",
  },
  description:
    "Listen to today's matchup, choose your favorite, and shape the global song leaderboard.",
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
