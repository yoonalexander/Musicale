import { PlayGame } from "@/components/play-game";
export const metadata = {
  title: "Play higher rated",
  description:
    "Two songs. One good instinct. Guess the higher community rating and keep your run going. No sign-up needed.",
};

export default function Play({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <PlayGame searchParams={searchParams} />;
}
