"use client";
import { useEffect, useRef } from "react";
import { useSiteEntry } from "@/lib/site-entry";

export function HowToPlay({
  autoOpen = false,
  mode = "play",
}: {
  autoOpen?: boolean;
  mode?: "play" | "rank";
}) {
  const ranking = mode === "rank";
  const title = ranking ? "How ranking works" : "How to play";
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const entered = useSiteEntry();
  useEffect(() => {
    if (!autoOpen || !entered) return;
    let seen = false;
    try {
      seen = localStorage.getItem("musicale-play-tutorial-v1") === "seen";
    } catch {}
    if (!seen && !dialog.current?.open) dialog.current?.showModal();
  }, [autoOpen, entered]);
  function close() {
    dialog.current?.close();
  }
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="tutorial-trigger"
        onClick={() => dialog.current?.showModal()}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">?</span> {title}
      </button>
      <dialog
        ref={dialog}
        className="tutorial-dialog"
        aria-labelledby={`${mode}-tutorial-title`}
        aria-describedby={`${mode}-tutorial-description`}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = event.currentTarget.querySelectorAll("button");
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClose={() => {
          try {
            localStorage.setItem("musicale-play-tutorial-v1", "seen");
          } catch {}
          opener.current?.focus();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          onClick={close}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          ×
        </button>
        <div className="tutorial-body" tabIndex={0}>
          <p className="kicker">
            {ranking
              ? "Your taste sets the tone."
              : "A little instinct. A lot of music."}
          </p>
          <h2 id={`${mode}-tutorial-title`}>{title}</h2>
          <p id={`${mode}-tutorial-description`}>
            {ranking
              ? "Two songs. One favorite. Help shape the community rankings."
              : "Two songs. Which one has the higher community rating?"}
          </p>
          {ranking ? (
            <ol className="tutorial-steps">
              <li>
                <strong>Listen to the pair.</strong>
                <p>Use the YouTube players or open a listening link.</p>
              </li>
              <li>
                <strong>Choose your favorite.</strong>
                <p>
                  There is no right answer. Your vote updates both songs’ Elo
                  ratings on the leaderboard.
                </p>
              </li>
              <li>
                <strong>Keep discovering.</strong>
                <p>
                  Both songs change after your vote. Your preferences stay saved
                  to your guest session or account.
                </p>
              </li>
            </ol>
          ) : (
            <>
              <div
                className="tutorial-example"
                aria-label="Example ratings, not the current round"
              >
                <div>
                  <span aria-hidden="true">A</span>
                  <strong>Song A</strong>
                  <b>1,580</b>
                </div>
                <div>
                  <span aria-hidden="true">B</span>
                  <strong>Song B</strong>
                  <b>1,490</b>
                </div>
              </div>
              <p className="tutorial-answer">
                In this example, Song A is higher rated.
              </p>
              <ol className="tutorial-steps">
                <li>
                  <strong>Listen, then trust your instinct.</strong>
                  <p>
                    Play a song on YouTube, use a listening link, or make your
                    pick straight away.
                  </p>
                </li>
                <li>
                  <strong>Get it right. Keep going.</strong>
                  <p>
                    Earn one point. Either song is randomly replaced, and you
                    choose again.
                  </p>
                </li>
                <li>
                  <strong>One wrong guess ends the run.</strong>
                  <p>
                    Your final score stays saved. Start another run whenever you
                    like.
                  </p>
                </li>
              </ol>
              <p className="tutorial-footnote">
                Listener votes in Rank set the ratings. Each round locks its
                answer when it starts.
              </p>
            </>
          )}
        </div>
        <button type="button" className="button" onClick={close}>
          {ranking ? "Let’s rank" : "Let’s play"}
        </button>
      </dialog>
    </>
  );
}
