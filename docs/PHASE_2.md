# Phase 2 — Public sign-in and daily voting

Started October 15, 2026 on `phase-2-public-daily-loop`, from completed Phase 1 branch `codex/phase-1-baseline` at `4cba07b`. New branch names omit `codex/` at the owner's request.

## Scope

Follow [roadmap Phase 2](ROADMAP.md#phase-2--complete-the-public-daily-loop): public email delivery, the exact owner account, today's matchup and the next 30 UTC days, hosted persistence, authentication feedback, honest unavailable states and UTC rollover.

Code and verification use the isolated local Supabase backend. Preview deployments remain read-only. Keep production schema upgrades, application promotion and legitimate hosted smoke participation explicit and recorded; never reset production or fabricate release evidence.

## Production prerequisites

- Correct Musicale account access was restored by the owner. A read-only check confirmed migrations `0001`–`0006`, twenty songs/providers, zero users/votes, no matchup today and none in the next 30 days. Custom SMTP remains disabled.
- The owner selected Resend, created its account and supplied the exact administrator email privately. Credentials and that email are excluded from Git/public documentation.
- Sending domain `auth.musicale.alexyoon.com` is **verified** in Resend. The owner approved publishing its DKIM TXT and two sending CNAME records; Namecheap saved all three and public DNS resolves them. Existing website records and the root mail policy were preserved. Prepared a sending-only API-key form restricted to this domain and the non-secret Supabase SMTP fields; credential creation/entry/submission is handed to the owner.
- Migration `0007` is **applied and tracked in production**. Before applying it, the exact previous function definition and baseline counts were saved in ignored local `tmp/` files. The transaction checked the six-migration/80-character starting state, replaced only the function and recorded `0007`. A separate read-only query confirmed one tracking record, the 60-character rule, twenty songs, zero users and zero votes. This was a targeted function backup, not a full database backup/restore rehearsal (Phase 6).
- Production Auth Site URL is `https://musicale.alexyoon.com` and its single allowed callback is exactly `https://musicale.alexyoon.com/api/auth/callback`.

## Work and evidence

- Sign-in submission shows a pending state and disables repeated submissions. Help text explains the newest link/same-browser requirement and spam-folder recovery. Provider/network failures return safe retry feedback; missing/used/invalid links offer a new sign-in request.
- A vote after session expiry redirects to sign-in without writing a vote.
- Unavailable Today states explain missing scheduling or unavailable songs and offer catalog/archive navigation.
- Daily matchups expire at their UTC end timestamp, disable stale vote controls and refresh authoritative server data. Returning to a visible tab rechecks the day; form submission also checks expiry before sending. Database time/window checks remain authoritative.
- Local validation: **18 unit checks, TypeScript, production build and 21 browser tests passed** on Chromium desktop/mobile and WebKit.
- [Clean-checkout CI](https://github.com/yoonalexander/musicale/actions/runs/38789364761) passed on implementation commit `637b77273b989d2ea940b66cd42297b7f2c69909`: **18 unit checks, 22 database checks, production build, 28 browser tests including Firefox, TypeScript and zero audit vulnerabilities**. [Draft PR #2](https://github.com/yoonalexander/musicale/pull/2) is stacked on Phase 1.
- Extended the Admin queue shortcut to the next **30 UTC days**, repeating the ten starter pairs and preserving occupied days through the existing batch RPC. Browser checks assert all thirty dates exist and a repeated click preserves their IDs and pairings. [Final clean-checkout CI](https://github.com/yoonalexander/musicale/actions/runs/38814328618) passed on implementation commit `72be9eae0dd1f20c24e6309f9f9dfb4c2663dd4a`: **18 unit checks, 22 database checks, production build, 28 browser tests across Chromium, Firefox, WebKit and mobile, TypeScript and zero audit vulnerabilities**.
- Rechecked today's intended provider links in Chrome: the official Aretha Franklin audio and Beach Boys music video both resolved with active playback controls. Playback was stopped after inspection; this is availability evidence, not a claimed personal listening preference or production vote.
- Restored the October 15 production matchup through trusted SQL setup: `respect-aretha` versus `god-only-knows`, from `2026-10-15T00:00:00Z` to `2026-10-16T00:00:00Z`. The insert preserved any existing day with `ON CONFLICT DO NOTHING`. A returned database row and the live Today page confirmed Musicale #12 and both provider links. No app owner existed yet, so this one-time bootstrap has no `created_by` account. It does not establish the next-thirty-day queue or authenticated Admin access.
- New browser cases cover pending submission, reused/invalid links, session expiry and rollover through both a running timer (Honolulu) and a simulated suspended-tab resume (Tokyo). Refresh is held in the test to prove stale controls disable before the server response; an unavailable local matchup then verifies the fresh empty state. The test restores the local fixture afterward. This simulates client rollover; it is not evidence of an elapsed production midnight or a new production vote.

Public delivery, administrator assignment, the next-thirty-day production queue and legitimate hosted persistence checks remain pending. The owner is a Supabase team recipient, so an additional real non-team email is requested for the ordinary-user delivery check. No Phase 2 acceptance gate is marked complete yet. The application changes remain on the stacked draft PR; the public website has not been promoted to this branch.

## Hosted completion checklist

- [x] Apply and verify migration `0007`; verify sending-domain DNS and exact callback.
- [x] Restore today's production matchup and inspect both provider links.
- [ ] Owner creates the domain-restricted sending credential, enters it directly in Supabase SMTP and saves; confirm persisted settings without exposing the credential.
- [ ] Complete owner app sign-in, identify its exact account and grant the administrator role through trusted setup.
- [ ] Use authenticated Admin scheduling to populate the next 30 UTC days while preserving today and existing scheduled days.
- [ ] A real non-team account receives its sign-in email, completes sign-in and remains denied Admin access.
- [ ] With that account and a legitimate listener's choice, verify a saved vote, reload/revisit behavior, duplicate rejection, Profile/history and first-day streak.

Local browser tests cover time-zone and rollover behavior; production participation remains a separate check. Credentials, personal email addresses and local screenshots/backups are excluded from Git.

## References checked

- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow): code exchange requires the browser/device that began sign-in.
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [Resend integration](https://supabase.com/partners/resend): custom SMTP enables public auth delivery.
- [Playwright clock](https://playwright.dev/docs/clock): `fastForward` models missed timers, while `setSystemTime` changes the clock without firing timers.
