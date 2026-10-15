# Phase 2 — Public sign-in and daily voting

Started October 15, 2026 on `phase-2-public-daily-loop`, from completed Phase 1 branch `codex/phase-1-baseline` at `4cba07b`. New branch names omit `codex/` at the owner's request.

## Scope

Follow [roadmap Phase 2](ROADMAP.md#phase-2--complete-the-public-daily-loop): public email delivery, the exact owner account, today's matchup and the next 30 UTC days, hosted persistence, authentication feedback, honest unavailable states and UTC rollover.

Code and verification use the isolated local Supabase backend. Preview deployments remain read-only. Keep production schema upgrades, application promotion and legitimate hosted smoke participation explicit and recorded; never reset production or fabricate release evidence.

## Production prerequisites

- Correct Musicale account access was restored by the owner. A read-only check confirmed migrations `0001`–`0006`, twenty songs/providers, zero users/votes, no matchup today and none in the next 30 days. Custom SMTP remains disabled.
- The owner selected Resend, created its account and supplied the exact administrator email privately. Credentials and that email are excluded from Git/public documentation.
- Prepared sending domain: `auth.musicale.alexyoon.com`. Resend requires a DKIM TXT record and two sending CNAME records. DNS access/verification and SMTP credential setup are pending. Leave existing website records and the root DMARC policy unchanged.
- Migration `0007` changes the display-name RPC's future edit limit to 60 characters. It preserves existing values and passed locally. Apply it through the normal hosted migration process before promoting the application changes; it has not been applied to production in this work.

## Work and evidence

- Sign-in submission shows a pending state and disables repeated submissions. Help text explains the newest link/same-browser requirement and spam-folder recovery. Provider/network failures return safe retry feedback; missing/used/invalid links offer a new sign-in request.
- A vote after session expiry redirects to sign-in without writing a vote.
- Unavailable Today states explain missing scheduling or unavailable songs and offer catalog/archive navigation.
- Daily matchups expire at their UTC end timestamp, disable stale vote controls and refresh authoritative server data. Returning to a visible tab rechecks the day; form submission also checks expiry before sending. Database time/window checks remain authoritative.
- Local validation: **18 unit checks, TypeScript, production build and 21 browser tests passed** on Chromium desktop/mobile and WebKit.
- New browser cases cover pending submission, reused/invalid links, session expiry and rollover through both a running timer (Honolulu) and a simulated suspended-tab resume (Tokyo). Refresh is held in the test to prove stale controls disable before the server response; an unavailable local matchup then verifies the fresh empty state. The test restores the local fixture afterward. This simulates client rollover; it is not evidence of an elapsed production midnight or a new production vote.

Public delivery, administrator assignment, production scheduling and legitimate hosted persistence checks remain pending. No Phase 2 acceptance gate is marked complete yet.

## References checked

- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow): code exchange requires the browser/device that began sign-in.
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [Resend integration](https://supabase.com/partners/resend): custom SMTP enables public auth delivery.
- [Playwright clock](https://playwright.dev/docs/clock): `fastForward` models missed timers, while `setSystemTime` changes the clock without firing timers.
