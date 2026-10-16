import Link from "next/link";
import { startPlay } from "@/app/play/actions";
import { GuestForm } from "@/components/guest-form";
import { SubmitButton } from "@/components/submit-button";
import { isDemoMode } from "@/lib/data";

export default function Home() {
  const date = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
  return (
    <section className="game-welcome" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="music-mark" aria-hidden="true">
          <svg viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r="29"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="40"
              cy="40"
              r="19"
              stroke="currentColor"
              strokeWidth="1"
              opacity=".35"
            />
            <path
              d="M34 29v24m12-30v24m-24-9v10m36-19v10"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="kicker">Your daily dose of music instinct</p>
        <h1 id="welcome-title">
          Musicale<span aria-hidden="true">.</span>
        </h1>
        <p className="welcome-promise">
          Two songs.
          <br />
          One good instinct.
        </p>
        <p className="welcome-description">
          Pick the higher-rated song.
          <br />
          See how far your taste takes you.
        </p>
        <GuestForm action={startPlay} className="welcome-start">
          <SubmitButton disabled={isDemoMode()} busyText="Getting your songs…">
            Play <span aria-hidden="true">↗</span>
          </SubmitButton>
        </GuestForm>
        <p className="welcome-reassurance">
          No sign-up. Unlimited runs. Just music.
        </p>
        {isDemoMode() ? (
          <p className="notice">
            This preview is read-only. Explore the catalog below.
          </p>
        ) : null}
        <div className="welcome-alternatives">
          <Link href="/rank">
            Help rank the music <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/leaderboard">Explore the leaderboard</Link>
        </div>
        <p className="welcome-date">
          <time>{date}</time>
          <span>A little music, every day.</span>
        </p>
        <p className="welcome-daily">
          One shared vote a day? <Link href="/today">Try Daily</Link>
        </p>
      </div>
    </section>
  );
}
