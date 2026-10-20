"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { type LeaderSort } from "@/lib/leaderboard-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Song } from "@/types/domain";
export function LiveLeaderboard({
  initial,
  page,
  pageSize,
  sort,
  query,
  live,
}: {
  initial: { songs: Song[]; total: number };
  page: number;
  pageSize: number;
  sort: LeaderSort;
  query: string;
  live: boolean;
}) {
  const [{ songs, total }, setRanking] = useState(initial);
  const [status, setStatus] = useState("Connecting to live rankings…");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!live) return;
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let disposed = false,
      connected = false,
      refreshing = false,
      queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | undefined;
    async function refresh() {
      if (disposed || document.visibilityState === "hidden") return;
      if (refreshing) {
        queued = true;
        return;
      }
      refreshing = true;
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 10000);
      try {
        const response = await fetch(
          "/api/leaderboard?" + query + "&page=" + page,
          { cache: "no-store", signal: active.signal },
        );
        if (!response.ok) throw new Error("Ranking refresh failed");
        const ranking = await response.json();
        if (!disposed) {
          setRanking(ranking);
          setStatus(
            connected
              ? "Live rankings connected"
              : "Live updates disconnected. Rankings may be stale.",
          );
        }
      } catch {
        if (!disposed)
          setStatus("Could not refresh rankings. Rankings may be stale.");
      } finally {
        clearTimeout(timeout);
        refreshing = false;
        if (queued && !disposed) {
          queued = false;
          schedule();
        }
      }
    }
    function schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 150);
    }
    const channel = db
      .channel("public-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "songs" },
        schedule,
      )
      .on("system", {}, (message) => {
        if (message.extension === "postgres_changes") {
          connected = message.status === "ok";
          if (connected) schedule();
          else if (!disposed)
            setStatus("Live updates disconnected. Rankings may be stale.");
        }
      })
      .subscribe((state) => {
        if (state === "SUBSCRIBED") schedule();
        else if (!disposed) {
          connected = false;
          setStatus("Live updates disconnected. Rankings may be stale.");
        }
      });
    const visible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const online = () => setRetry((n) => n + 1);
    const offline = () => {
      connected = false;
      setStatus("Live updates disconnected. Rankings may be stale.");
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      void db.removeChannel(channel);
    };
  }, [query, page, live, retry]);
  const link = (p: number) => ("/leaderboard?" + query + "&page=" + p) as Route;
  return (
    <>
      {live ? (
        <p role="status">
          {status}{" "}
          <button
            type="button"
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Refresh rankings
          </button>
        </p>
      ) : null}
      <div className="leaderboard">
        <div className="leader-head">
          <span>Position</span>
          <span>Song</span>
          <span>Record / win rate</span>
          <span>Rating</span>
        </div>
        {songs.map((s, i) => (
          <div className="leader-row" key={s.id} data-song-id={s.id}>
            <b className={s.matchupCount ? undefined : "unranked"}>
              {s.matchupCount ? (page - 1) * pageSize + i + 1 : "unranked"}
            </b>
            <div className="leader-song">
              <div>
                <Link href={`/songs/${s.id}`} className="leader-song-title">
                  <strong>{s.title}</strong>
                </Link>
                <small>
                  {s.artistName} · {s.releaseYear}
                </small>
                <a
                  className="leader-listen"
                  href={
                    s.providers.find(
                      (provider) => provider.provider === "youtube",
                    )?.externalUrl ??
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.artistName} ${s.title}`)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Listen on YouTube: ${s.title} by ${s.artistName}`}
                >
                  Listen on YouTube <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <span>
              {s.wins}–{s.losses}
              <small>
                {s.matchupCount} votes ·{" "}
                {s.matchupCount
                  ? Math.round((100 * s.wins) / s.matchupCount)
                  : 0}
                % wins
              </small>
            </span>
            <b>
              {Math.round(s.eloRating)}
              {s.matchupCount < 5 ? (
                <small>
                  {s.matchupCount === 0 ? "Initial rating" : "Provisional"}
                </small>
              ) : null}
              {sort === "movement" ? (
                <small>
                  {(s.recentMovement ?? 0) > 0 ? "+" : ""}
                  {Math.round(s.recentMovement ?? 0)} this week
                </small>
              ) : null}
            </b>
          </div>
        ))}
      </div>
      {!songs.length ? <p>No songs match these filters.</p> : null}
      <nav className="pagination" aria-label="Leaderboard pages">
        {page > 1 ? (
          <Link className="button secondary" href={link(page - 1)}>
            Previous
          </Link>
        ) : null}
        <span>
          Page {page} · {total} songs
        </span>
        {page * pageSize < total ? (
          <Link className="button secondary" href={link(page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
