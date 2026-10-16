"use client";
import Link from "next/link";
export default function ErrorPage() {
  return (
    <section className="empty">
      <h1>We couldn’t tune in.</h1>
      <p>Musicale could not load this page. Try again shortly.</p>
      <p>
        <Link href="/help">Get help</Link> or report the issue at{" "}
        <a href="https://github.com/yoonalexander/musicale/issues/new">
          Musicale support
        </a>
        .
      </p>
      <button className="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </section>
  );
}
