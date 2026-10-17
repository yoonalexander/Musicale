"use client";
import { useEffect, useRef, useState } from "react";
import type { AudioPreview } from "@/lib/audio";
import { track } from "@/lib/analytics";

let active: (() => void) | null = null;
const LIMIT = 15;
type Status =
  | "ready"
  | "loading"
  | "playing"
  | "buffering"
  | "paused"
  | "finished"
  | "error";
const time = (seconds: number) =>
  `0:${String(Math.floor(Math.max(0, seconds))).padStart(2, "0")}`;

export function AudioPreviewPlayer({
  title,
  preview,
}: {
  title: string;
  preview: AudioPreview;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const graph = useRef<{
    context: AudioContext;
    gain: GainNode;
    source: MediaElementAudioSourceNode;
  } | null>(null);
  const timing = useRef({
    heard: 0,
    since: null as number | null,
    deadline: 0,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const alive = useRef(true);
  const started = useRef(false);
  const reportedFailure = useRef(false);
  const pauseHandler = useRef<() => void>(() => {});
  const owner = useRef(() => pauseHandler.current());
  const intent = useRef(false);
  const [status, setStatus] = useState<Status>("ready");
  const [position, setPosition] = useState(0);
  const [remaining, setRemaining] = useState(LIMIT);
  const [duration, setDuration] = useState(LIMIT);
  const start = preview.startSeconds ?? 0;

  function silence() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cancelAnimationFrame(frame.current);
    const g = graph.current,
      t = timing.current;
    if (g) {
      if (t.since !== null)
        t.heard = Math.min(
          LIMIT,
          t.heard +
            Math.max(0, Math.min(g.context.currentTime, t.deadline) - t.since),
        );
      t.since = null;
      g.gain.gain.cancelScheduledValues(g.context.currentTime);
      g.gain.gain.setValueAtTime(0, g.context.currentTime);
    }
  }
  function pause() {
    intent.current = false;
    silence();
    audio.current?.pause();
    if (active === owner.current) active = null;
    if (alive.current)
      setStatus((s) =>
        ["error", "finished", "ready"].includes(s) ? s : "paused",
      );
  }
  pauseHandler.current = pause;
  function finish() {
    silence();
    intent.current = false;
    audio.current?.pause();
    if (active === owner.current) active = null;
    if (alive.current) {
      setStatus("finished");
      setRemaining(0);
      if (audio.current)
        setPosition(
          Math.min(duration, Math.max(0, audio.current.currentTime - start)),
        );
    }
  }
  function fail() {
    pause();
    setStatus("error");
    if (!reportedFailure.current) {
      reportedFailure.current = true;
      track("preview_play_failed");
    }
  }
  function paint() {
    const a = audio.current,
      g = graph.current,
      t = timing.current;
    if (!a || !g || t.since === null) return;
    const cursor = Math.min(duration, Math.max(0, a.currentTime - start));
    setPosition(cursor);
    setRemaining(
      Math.max(
        0,
        Math.min(
          duration - cursor,
          LIMIT - t.heard - (g.context.currentTime - t.since),
        ),
      ),
    );
    if (
      a.currentTime >= start + duration ||
      g.context.currentTime >= t.deadline
    )
      finish();
    else frame.current = requestAnimationFrame(paint);
  }
  function playing() {
    const a = audio.current,
      g = graph.current;
    if (!a || !g || !intent.current || active !== owner.current) {
      a?.pause();
      return;
    }
    silence();
    const seconds = Math.min(
      duration - Math.max(0, a.currentTime - start),
      LIMIT - timing.current.heard,
    );
    if (seconds <= 0) {
      finish();
      return;
    }
    const now = g.context.currentTime;
    timing.current.since = now;
    timing.current.deadline = now + seconds;
    // The audio clock mutes at the deadline even when browser timers or frames are throttled.
    g.gain.gain.setValueAtTime(1, now);
    g.gain.gain.setValueAtTime(0, now + seconds);
    timer.current = setTimeout(finish, seconds * 1000);
    setStatus("playing");
    if (!started.current) {
      started.current = true;
      track("preview_play_started");
    }
    frame.current = requestAnimationFrame(paint);
  }
  async function play() {
    const a = audio.current;
    if (!a) return;
    if (active && active !== owner.current) active();
    active = owner.current;
    intent.current = true;
    setStatus("loading");
    try {
      if (!graph.current) {
        const context = new AudioContext();
        const gain = context.createGain(),
          source = context.createMediaElementSource(a);
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(context.destination);
        graph.current = { context, gain, source };
      }
      await graph.current.context.resume();
      if (!alive.current || !intent.current || active !== owner.current) return;
      if (
        status === "finished" ||
        status === "error" ||
        a.currentTime >= start + duration
      ) {
        timing.current.heard = 0;
        started.current = false;
        reportedFailure.current = false;
        if (status === "error") a.load();
        else a.currentTime = start;
        setPosition(0);
        setRemaining(duration);
      }
      if (a.currentTime < start) a.currentTime = start;
      await a.play();
    } catch (error) {
      if (
        alive.current &&
        intent.current &&
        (error as Error).name !== "AbortError"
      )
        fail();
    }
  }
  useEffect(() => {
    alive.current = true;
    const a = audio.current;
    if (a && !a.getAttribute("src")) a.src = preview.url!;
    if (a?.error) fail();
    const hidden = () => {
      if (document.hidden) owner.current();
    };
    const leaving = () => owner.current();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      alive.current = false;
      owner.current();
      a?.removeAttribute("src");
      a?.load();
      graph.current?.source.disconnect();
      graph.current?.gain.disconnect();
      void graph.current?.context.close();
      graph.current = null;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  const busy = status === "loading" || status === "buffering";
  return (
    <section
      className="audio-preview"
      aria-label={`15-second preview of ${title}`}
      data-state={status}
    >
      <audio
        ref={audio}
        crossOrigin="anonymous"
        preload="none"
        aria-label={`Preview ${title}`}
        src={preview.url!}
        onLoadedMetadata={() => {
          const a = audio.current!;
          if (!Number.isFinite(a.duration) || a.duration <= start) {
            fail();
            return;
          }
          setDuration(Math.min(LIMIT, a.duration - start));
          if (a.currentTime < start) a.currentTime = start;
        }}
        onPlaying={playing}
        onPause={() => {
          silence();
          if (alive.current)
            setStatus((s) =>
              ["finished", "error", "ready"].includes(s) ? s : "paused",
            );
        }}
        onWaiting={() => {
          silence();
          if (intent.current) setStatus("buffering");
        }}
        onSeeking={() => {
          silence();
          const a = audio.current!;
          if (a.currentTime < start) a.currentTime = start;
          if (a.currentTime >= start + duration) finish();
        }}
        onSeeked={() => {
          if (
            intent.current &&
            !audio.current?.paused &&
            audio.current!.readyState >= 3
          )
            playing();
        }}
        onRateChange={() => {
          if (audio.current && audio.current.playbackRate !== 1)
            audio.current.playbackRate = 1;
        }}
        onEnded={finish}
        onError={() => {
          if (alive.current) fail();
        }}
      />
      <div className="audio-preview-controls">
        <button
          type="button"
          className="audio-toggle"
          aria-label={`${status === "playing" || busy ? "Pause" : status === "finished" ? "Replay" : status === "error" ? "Retry" : "Play"} preview of ${title}`}
          onClick={() => (status === "playing" || busy ? pause() : void play())}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            {status === "playing" || busy ? (
              <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
            ) : (
              <path d="m8 4 12 8-12 8z" />
            )}
          </svg>
        </button>
        <div className="audio-timeline">
          <div className="audio-caption">
            <span>15-second preview</span>
            <span role="status">
              {
                {
                  ready: "Press play",
                  loading: "Loading…",
                  playing: "Playing",
                  buffering: "Buffering…",
                  paused: "Paused",
                  finished: "Replay available",
                  error: "Preview unavailable",
                }[status]
              }
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={position}
            disabled={
              status === "ready" || status === "error" || status === "finished"
            }
            aria-label={`Preview position for ${title}`}
            aria-valuetext={`${time(position)} elapsed, ${time(remaining)} remaining`}
            onChange={(event) => {
              silence();
              const next = Number(event.target.value);
              audio.current!.currentTime = start + next;
              setPosition(next);
              setRemaining(
                Math.max(
                  0,
                  Math.min(duration - next, LIMIT - timing.current.heard),
                ),
              );
              if (next >= duration) finish();
            }}
          />
          <div className="audio-times">
            <span aria-label="Elapsed">{time(position)}</span>
            <span aria-label="Remaining">−{time(Math.ceil(remaining))}</span>
          </div>
        </div>
      </div>
      {status === "error" ? (
        <p className="audio-error">
          Try again or use the listening links below.
        </p>
      ) : null}
    </section>
  );
}
