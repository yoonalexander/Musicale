"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { submitDailyVote } from "@/app/actions";
import { SongListening } from "@/components/song-listening";
import { ArtworkCredit } from "@/components/artwork-credit";
import { resultMessage, shareResult } from "@/lib/share";
import type { Matchup, Song } from "@/types/domain";
import { track } from "@/lib/analytics";

function VoteButton({ title, disabled }: { title: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" disabled={disabled || pending}>
      {pending ? "Recording…" : `Vote for ${title}`}
    </button>
  );
}
function Card({
  song,
  matchup,
  disabled,
  onExpired,
}: {
  song: Song;
  matchup: Matchup;
  disabled: boolean;
  onExpired: () => void;
}) {
  const chosen = matchup.selectedSongId === song.id;
  return (
    <article
      className={`song-choice ${chosen ? "chosen" : matchup.selectedSongId ? "unselected" : ""}`}
    >
      <div className="art">
        {song.artworkUrl ? (
          <img
            src={song.artworkUrl}
            alt={`${song.title} album artwork`}
            width="600"
            referrerPolicy="no-referrer"
            height="600"
          />
        ) : (
          <span aria-hidden="true">{song.title[0]}</span>
        )}
      </div>
      <p className="kicker">
        {song.albumName} · {song.releaseYear}
        {song.genre ? ` · ${song.genre}` : ""}
      </p>
      <h2>{song.title}</h2>
      <p>{song.artistName}</p>
      <ArtworkCredit song={song} />
      {song.durationMs ? (
        <p>
          {Math.floor(song.durationMs / 60000)}:
          {String(Math.floor(song.durationMs / 1000) % 60).padStart(2, "0")}
        </p>
      ) : null}
      {chosen ? <p className="selected-label">Your pick ✓</p> : null}
      <div className="card-actions">
        <SongListening key={song.id} song={song} />
        <form
          action={submitDailyVote}
          onSubmit={(event) => {
            if (Date.now() >= Date.parse(matchup.endsAt)) {
              event.preventDefault();
              onExpired();
              return;
            }
            try {
              sessionStorage.setItem("musicale-vote-pending", matchup.id);
            } catch {}
          }}
        >
          <input type="hidden" name="matchupId" value={matchup.id} />
          <input type="hidden" name="selectedSongId" value={song.id} />
          <VoteButton title={song.title} disabled={disabled} />
        </form>
      </div>
    </article>
  );
}
export function DailyMatchup({
  matchup,
  canVote,
  streak = 0,
}: {
  matchup: Matchup;
  canVote: boolean;
  streak?: number;
}) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const voted = Boolean(matchup.selectedSongId);
  useEffect(() => {
    let refreshed = false;
    function checkDay() {
      // shortcut: an inaccurate browser clock may expire early; use a server offset if this becomes a reported issue.
      const ended = Date.now() >= Date.parse(matchup.endsAt);
      setExpired(ended);
      if (ended && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") checkDay();
    }
    checkDay();
    const timer = window.setTimeout(
      checkDay,
      Math.max(0, Date.parse(matchup.endsAt) - Date.now()),
    );
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [matchup.id, matchup.endsAt, router]);
  function refreshExpiredDay() {
    setExpired(true);
    router.refresh();
  }
  useEffect(() => {
    try {
      if (
        voted &&
        sessionStorage.getItem("musicale-vote-pending") === matchup.id
      ) {
        sessionStorage.removeItem("musicale-vote-pending");
        track("vote_submitted");
        if (streak > 1) track("streak_continued");
      }
    } catch {}
  }, [voted, matchup.id, streak]);
  const agreedVotes =
    matchup.selectedSongId === matchup.songA.id
      ? matchup.songAVotes
      : matchup.songBVotes;
  const pct = matchup.totalVotes
    ? Math.round(
        (100 *
          (matchup.selectedSongId === matchup.songA.id
            ? matchup.songAVotes
            : matchup.songBVotes)) /
          matchup.totalVotes,
      )
    : 0;
  return (
    <>
      {expired ? (
        <p className="notice" role="status">
          This matchup has ended. Loading today’s choice…{" "}
          <button className="text-button" onClick={() => router.refresh()}>
            Refresh today
          </button>
        </p>
      ) : null}
      <div className="matchup">
        <Card
          song={matchup.songA}
          matchup={matchup}
          disabled={!canVote || voted || expired}
          onExpired={refreshExpiredDay}
        />
        <div className="versus" aria-hidden="true">
          VS
        </div>
        <Card
          song={matchup.songB}
          matchup={matchup}
          disabled={!canVote || voted || expired}
          onExpired={refreshExpiredDay}
        />
      </div>
      {voted ? (
        <section className="result" aria-live="polite">
          <p className="kicker">Vote recorded</p>
          <h2>{pct}% chose the same song.</h2>
          <p>
            {resultMessage(
              matchup.totalVotes ? (100 * agreedVotes) / matchup.totalVotes : 0,
            )}{" "}
            {matchup.totalVotes}{" "}
            {matchup.totalVotes === 1 ? "listener has" : "listeners have"} voted
            so far.
          </p>
          <p>
            Your current streak:{" "}
            <strong>
              {streak} {streak === 1 ? "day" : "days"}
            </strong>
            .
          </p>
          <p>Come back tomorrow for a new matchup.</p>
          <Share matchup={matchup} percent={pct} streak={streak} />
        </section>
      ) : null}
    </>
  );
}
function Share({
  matchup,
  percent,
  streak,
}: {
  matchup: Matchup;
  percent: number;
  streak: number;
}) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const text = shareResult(matchup.number, percent, streak);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      track("share_copied");
      setStatus("Result copied.");
    } catch {
      setFallback(true);
      setStatus("Select and copy your result below.");
    }
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        setStatus("Result shared.");
      } catch (e) {
        if ((e as Error).name !== "AbortError") await copy();
      }
    } else await copy();
  }
  return (
    <>
      <div className="share-actions">
        <button className="button secondary" onClick={share}>
          Share result
        </button>
        <button className="button secondary" onClick={copy}>
          Copy spoiler-free result
        </button>
      </div>
      <p role="status">{status}</p>
      {fallback ? (
        <textarea
          aria-label="Share result"
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
    </>
  );
}
