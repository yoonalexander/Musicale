"use client";
import { GuestForm } from "@/components/guest-form";
import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { submitDailyVote } from "@/app/actions";
import { SongListening } from "@/components/song-listening";
import { ArtworkCredit } from "@/components/artwork-credit";
import { resultMessage, shareResult } from "@/lib/share";
import type { Matchup, Song } from "@/types/domain";
import { track } from "@/lib/analytics";

function VoteButton({
  title,
  id,
  disabled,
}: {
  title: string;
  id: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="button"
      name="selectedSongId"
      value={id}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? "Recording…" : `Vote for ${title}`}
    </button>
  );
}
function Card({
  song,
  matchup,
  disabled,
}: {
  song: Song;
  matchup: Matchup;
  disabled: boolean;
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
        <VoteButton title={song.title} id={song.id} disabled={disabled} />
      </div>
    </article>
  );
}
export function DailyMatchup({
  matchup,
  canVote,
  guestEntry = false,
  streak = 0,
  siteUrl,
}: {
  matchup: Matchup;
  canVote: boolean;
  guestEntry?: boolean;
  streak?: number;
  siteUrl: string;
}) {
  const router = useRouter();
  const resultHeading = useRef<HTMLHeadingElement>(null);
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
        resultHeading.current?.focus();
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
  const Form = guestEntry ? GuestForm : "form";
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
      <Form
        className="matchup"
        action={submitDailyVote}
        onSubmit={(event) => {
          if (Date.now() >= Date.parse(matchup.endsAt)) {
            event.preventDefault();
            refreshExpiredDay();
            return;
          }
          try {
            sessionStorage.setItem("musicale-vote-pending", matchup.id);
          } catch {}
        }}
      >
        <input type="hidden" name="matchupId" value={matchup.id} />
        <Card
          song={matchup.songA}
          matchup={matchup}
          disabled={!canVote || voted || expired}
        />
        <div className="versus" aria-hidden="true">
          VS
        </div>
        <Card
          song={matchup.songB}
          matchup={matchup}
          disabled={!canVote || voted || expired}
        />
      </Form>
      <p>
        Voting resets at 00:00 UTC on{" "}
        <time dateTime={matchup.endsAt}>{matchup.endsAt.slice(0, 10)}</time>.
      </p>
      {voted ? (
        <section className="result" aria-live="polite">
          <p className="kicker">Vote recorded</p>
          <h2 ref={resultHeading} tabIndex={-1} aria-describedby="saved-choice">
            {pct}% chose the same song.
          </h2>
          <p id="saved-choice">
            Your saved pick:{" "}
            <strong>
              {matchup.selectedSongId === matchup.songA.id
                ? matchup.songA.title
                : matchup.songB.title}
            </strong>
            .
          </p>
          <dl className="result-counts">
            <div>
              <dt>{matchup.songA.title}</dt>
              <dd>{matchup.songAVotes} votes</dd>
            </div>
            <div>
              <dt>{matchup.songB.title}</dt>
              <dd>{matchup.songBVotes} votes</dd>
            </div>
          </dl>
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
          <Share
            matchup={matchup}
            percent={pct}
            streak={streak}
            siteUrl={siteUrl}
          />
        </section>
      ) : null}
    </>
  );
}
function Share({
  matchup,
  percent,
  streak,
  siteUrl,
}: {
  matchup: Matchup;
  percent: number;
  streak: number;
  siteUrl: string;
}) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const text = shareResult(matchup.number, percent, streak, siteUrl);
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
