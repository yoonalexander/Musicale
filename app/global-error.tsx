"use client";
import ErrorPage from "./error";
import "./globals.css";
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main id="main-content">
          <ErrorPage />
        </main>
      </body>
    </html>
  );
}
