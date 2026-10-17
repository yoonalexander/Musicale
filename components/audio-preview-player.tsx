"use client";
import { useEffect, useRef, useState } from "react";
import type { AudioPreview } from "@/lib/audio";
import { track } from "@/lib/analytics";
import { pauseOtherYouTubePlayers } from "@/lib/youtube";

let active: (() => void) | null = null;
export function pauseAudioPreview() {
  active?.();
}
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
  const context = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const timing = useRef({
    heard: 0,
    position: 0,
    since: null as number | null,
    deadline: 0,
  });
  const request = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const frame = useRef(0);
  const alive = useRef(true);
  const intent = useRef(false);
  const started = useRef(false);
  const reportedFailure = useRef(false);
  const pauseHandler = useRef<() => void>(() => {});
  const owner = useRef(() => pauseHandler.current());
  const [status, setStatus] = useState<Status>("ready");
  const [position, setPosition] = useState(0);
  const [remaining, setRemaining] = useState(LIMIT);
  const [duration, setDuration] = useState(LIMIT);
  const start = preview.startSeconds ?? 0;
  const windowDuration = () =>
    Math.min(LIMIT, (buffer.current?.duration ?? start + LIMIT) - start);

  function cursor() {
    const t = timing.current;
    return (
      t.position +
      (t.since === null
        ? 0
        : Math.max(
            0,
            Math.min(context.current!.currentTime, t.deadline) - t.since,
          ))
    );
  }
  function silence() {
    cancelAnimationFrame(frame.current);
    const t = timing.current;
    const next = cursor();
    t.heard = Math.min(LIMIT, t.heard + next - t.position);
    t.position = next;
    t.since = null;
    const old = source.current;
    source.current = null;
    if (old) {
      old.stop();
      old.disconnect();
    }
  }
  function pause() {
    intent.current = false;
    operation.current++;
    request.current?.abort();
    silence();
    if (active === owner.current) active = null;
    if (alive.current) {
      setPosition(timing.current.position);
      setRemaining(
        Math.max(
          0,
          Math.min(
            windowDuration() - timing.current.position,
            LIMIT - timing.current.heard,
          ),
        ),
      );
      setStatus((s) =>
        ["ready", "error", "finished"].includes(s) ? s : "paused",
      );
    }
  }
  pauseHandler.current = pause;
  function finish() {
    pause();
    if (alive.current) {
      setStatus("finished");
      setRemaining(0);
    }
  }
  function fail() {
    pause();
    if (!alive.current) return;
    setStatus("error");
    if (!reportedFailure.current) {
      reportedFailure.current = true;
      track("preview_play_failed");
    }
  }
  function paint() {
    if (!source.current) return;
    const next = cursor();
    setPosition(next);
    setRemaining(
      Math.max(
        0,
        Math.min(
          windowDuration() - next,
          LIMIT - timing.current.heard - (next - timing.current.position),
        ),
      ),
    );
    frame.current = requestAnimationFrame(paint);
  }
  function begin() {
    if (
      !intent.current ||
      active !== owner.current ||
      !context.current ||
      !buffer.current
    )
      return;
    const ctx = context.current,
      t = timing.current;
    if (ctx.state !== "running") {
      owner.current();
      return;
    }
    const window = Math.min(LIMIT, buffer.current.duration - start);
    const seconds = Math.min(window - t.position, LIMIT - t.heard);
    if (seconds <= 0) {
      finish();
      return;
    }
    const node = ctx.createBufferSource();
    node.buffer = buffer.current;
    node.connect(ctx.destination);
    node.onended = () => {
      if (source.current === node) finish();
    };
    // The source duration stops on the audio clock, independently of UI timers.
    const now = ctx.currentTime;
    node.start(now, start + t.position, seconds);
    source.current = node;
    t.since = now;
    t.deadline = t.since + seconds;
    setStatus("playing");
    if (!started.current) {
      started.current = true;
      track("preview_play_started");
    }
    frame.current = requestAnimationFrame(paint);
  }
  async function play() {
    pauseOtherYouTubePlayers();
    if (active && active !== owner.current) active();
    active = owner.current;
    intent.current = true;
    const id = ++operation.current;
    setStatus("loading");
    try {
      if (!context.current) {
        context.current = new AudioContext();
        context.current.onstatechange = () => {
          if (source.current && context.current?.state !== "running")
            owner.current();
        };
      }
      await context.current.resume();
      if (!alive.current || id !== operation.current) return;
      if (status === "finished" || status === "error") {
        timing.current = { heard: 0, position: 0, since: null, deadline: 0 };
        started.current = false;
        reportedFailure.current = false;
        setPosition(0);
        setRemaining(windowDuration());
      }
      if (!buffer.current) {
        const controller = new AbortController();
        request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(preview.url!, {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          });
          if (
            !response.ok ||
            Number(response.headers.get("content-length")) > 10 * 1024 * 1024
          )
            throw new Error("Preview unavailable");
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 10 * 1024 * 1024)
            throw new Error("Preview too large");
          if (!alive.current || id !== operation.current) return;
          setStatus("buffering");
          const decoded = await Promise.race([
            context.current.decodeAudioData(bytes),
            new Promise<never>((_, reject) =>
              controller.signal.addEventListener(
                "abort",
                () => reject(new Error("Preview cancelled")),
                { once: true },
              ),
            ),
          ]);
          if (!alive.current || id !== operation.current) return;
          if (controller.signal.aborted) throw new Error("Preview timed out");
          if (!Number.isFinite(decoded.duration) || decoded.duration <= start)
            throw new Error("Invalid snippet");
          buffer.current = decoded;
          setDuration(Math.min(LIMIT, decoded.duration - start));
          setRemaining(windowDuration());
        } finally {
          clearTimeout(timeout);
        }
      }
      if (alive.current && id === operation.current) begin();
    } catch {
      if (alive.current && id === operation.current && intent.current) fail();
    }
  }
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.hidden) owner.current();
    };
    const leaving = () => owner.current();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      alive.current = false;
      owner.current();
      if (context.current) {
        context.current.onstatechange = null;
        void context.current.close();
      }
      context.current = null;
      buffer.current = null;
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
      data-source={preview.url}
    >
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
              !buffer.current || status === "error" || status === "finished"
            }
            aria-label={`Preview position for ${title}`}
            aria-valuetext={`${time(position)} elapsed, ${time(remaining)} remaining`}
            onChange={(event) => {
              silence();
              const next = Number(event.target.value);
              timing.current.position = next;
              setPosition(next);
              setRemaining(
                Math.max(
                  0,
                  Math.min(duration - next, LIMIT - timing.current.heard),
                ),
              );
              if (next >= duration) finish();
              else if (intent.current) begin();
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
          Try again in a moment, or use an available listening link.
        </p>
      ) : null}
    </section>
  );
}
