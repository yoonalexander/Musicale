import { PlayGame } from "@/components/play-game";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <PlayGame searchParams={searchParams} returnTo="/" />;
}
