"use client";
import { useEffect, useRef } from "react";
import { useSiteEntry } from "@/lib/site-entry";

export function HowToPlay({ autoOpen = false }: { autoOpen?: boolean }) {
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
        <span aria-hidden="true">?</span> How to play
      </button>
      <dialog
        ref={dialog}
        className="tutorial-dialog"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
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
          aria-label="Close how to play"
        >
          ×
        </button>
        <div className="tutorial-body" tabIndex={0}>
          <p className="kicker">A little instinct. A lot of music.</p>
          <h2 id="tutorial-title">How to play</h2>
          <p id="tutorial-description">
            Two songs. Which one has the higher community rating?
          </p>
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
                Play a 15-second preview when available, use a listening link,
                or make your pick straight away.
              </p>
            </li>
            <li>
              <strong>Get it right. Keep going.</strong>
              <p>
                Earn one point. Either song is randomly replaced, and you choose
                again.
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
            Listener votes in Rank and Daily set the ratings. Each round locks
            its answer when it starts.
          </p>
        </div>
        <button type="button" className="button" onClick={close}>
          Let’s play
        </button>
      </dialog>
    </>
  );
}
