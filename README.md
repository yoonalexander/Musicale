# Musicale

**Every day. Two songs. One choice.** Everyone gets the same editorial matchup, listens on an official music provider, votes once, and helps build an auditable Elo leaderboard.

See the [project status review](docs/PROJECT_STATUS.md) for the current verification boundary and the [completion roadmap](docs/ROADMAP.md) for phased work, release acceptance checks, and résumé claim evidence.

## Product and architecture

This rebuild replaces the previous musical-theatre ranking / higher-lower game. The July 2026 product request called for a shared daily vote loop inspired by Wordle, with a monochrome editorial interface, one accent color, persistent accounts, and server-calculated ratings and streaks. The original unfinished changes were completed around that MVP; personalized modes and social features remain future work. See [the refactor notes](docs/REFACTOR.md).

- Next.js 15 App Router, React 19, TypeScript, server-rendered pages and server actions.
- Supabase Auth with passwordless email magic links, PostgreSQL and row-level security.
- One global day: midnight UTC inclusive through the next midnight exclusive. Browser dates never determine eligibility or streaks.
- A transactional `submit_daily_vote` RPC locks the matchup and songs, validates membership/time/status, prevents duplicates, updates both ratings/records, records an audit event, updates participation, and saves daily rating snapshots.
- Elo begins at 1500. Admin-configured K-factor (1–100, default 24) lives in `app_settings` and is recorded with each rating event. Rounded rating changes are equal and opposite.
- Song providers are normalized separately. The launch UI opens official HTTPS provider links; it does not load third-party players or download audio.
- Vercel-compatible: no separate application server, Redis or paid analytics service.

Implemented pages: landing, Today, filtered/sortable leaderboard, song details, editable profile with paginated voting history and evidence-based listening statistics, email sign-in, featured completed matchups, privacy/analytics preferences, and protected administration. These screens exist, but the completion roadmap tracks remaining behavior, operations and release verification. The original brief's future social/personalized modes remain later work.

Leaderboard filters cover genre, artist, year, decade and minimum votes. Sort by Elo, win percentage, total votes or seven-day rating movement. Only the public leaderboard is cached (30 seconds), with immediate invalidation after voting/editorial changes; private vote and profile state is never publicly cached.

## Local setup

Use Node.js 20.19+ and install locked dependencies:

```sh
npm ci
```

For preview mode, leave both Supabase variables empty. Vercel Preview builds fail if either Supabase variable is present; keep both scoped to Production only. Read-only pages display a preview notice. The twenty-song starter catalog remains browsable with external playback links; accounts and persistent voting stay disabled. Preview ratings are initial values, not fabricated community statistics. Primary catalog sources are documented in [CATALOG.md](docs/CATALOG.md).

For a fully local backend, start Docker Desktop with its Linux engine and run:

```sh
npm run local:start
```

This initializes the database, applies migrations in order, and seeds today's matchup. Musicale uses ports **55321** (API), **55322** (PostgreSQL), and **55324** (local email catcher), separate from other projects. Emails sent locally stay in the catcher.

Create `.env.local` from `.env.example` without overwriting existing values. Get the local URL and anon key with `npx supabase status`; set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Then run:

```sh
npm run dev
```

Visit `http://localhost:3000`. Open `http://127.0.0.1:55324` to follow local sign-in emails. `npm run local:stop` stops only this project's backend and preserves its local database.

To use a hosted Supabase project instead, apply the migrations as described below, fill in its URL/anon key, and configure the Site URL plus the exact `/api/auth/callback` redirect in Supabase Auth. Both configuration values must be set together. The only supported Musicale reset time zone is UTC.

New email sign-ins require both **Confirm signup** and **Magic Link** templates to use [supabase/templates/sign-in.html](supabase/templates/sign-in.html). Opening that link displays a confirmation page; only pressing **Confirm sign-in** consumes the token and creates the browser session. Deploy the application support before changing hosted templates; [Phase 2 rollout instructions](docs/PHASE_2.md#required-rollout-order) include ordering and rollback. Previously sent PKCE links remain supported in their requesting browser.

## Database migration and existing data

`0001_initial.sql` is unchanged historical migration content. **Do not replace or reapply an already-applied migration.**

- Fresh database: apply migrations `0001` through `0007` in order, followed by `seed.sql`.
- Database running the original app: apply migrations `0002` through `0007` in order, then `seed.sql`.
- Database already running the daily MVP through `0003`: apply `0004` through `0007`, then seed to add missing starter records/providers. Repeat seeding preserves editorial changes, availability, ratings and scheduled days.
- With Supabase CLI migration tracking, use normal ordered migration application; do not run a reset against hosted data.

Migration 0002 moves the old songs, votes, profiles, game runs and quota records into the **private, unexposed `musicale_legacy` schema**. Existing account identities, join dates, display names and admin roles are copied into the new profiles. Old votes and ratings are preserved for reference, rather than mixed into the new catalog. The old public ranking RPC is removed. Migration 0003 completes access controls, result privacy, admin audit/import tools, configurable Elo, and history queries.

Migration 0004 adds durable request limits, richer profiles/catalog metadata, analytics aggregates, featured archives and ranking recovery. Migration 0005 adds atomic batch scheduling and database provider-domain checks; migration 0006 indexes request cleanup. Migration 0007 aligns the display-name RPC with the form/server limit of 60 characters; it preserves existing names and rejects invalid future edits. Provider checks preserve existing potentially stale data while enforcing new writes; inspect provider readiness before scheduling.

Before rollout, take a database backup, inspect the starting schema, and apply the upgrade to an isolated copy. If the unfinished July rewrite of `0001_initial.sql` was applied manually, that is a different starting schema: do not apply the legacy upgrade blindly; preserve/export that data and reconcile it first. The fresh Musicale production project was bootstrapped on October 1, 2026; see [deployment status](docs/DEPLOYMENT.md).

To assign an administrator, use a trusted SQL session to set the selected authenticated user's `profiles.role` to `admin`. Owners cannot change roles, Elo, vote history, streaks or totals through the public API.

## Administration

Admin supports a song editor, JSON/CSV paste or file imports, scheduling/replacing/cancelling future unvoted matchups, a thirty-day queue repeating the ten curated starter pairs, featured completed matchups, provider-readiness checks, participation counts, unusual voting request volume, opt-in event totals, availability changes, K-factor settings and ranking recovery. Editorial mutations are recorded in `admin_audit_log`. Importing an existing ID preserves its rating and record; a failed import rolls back the entire batch. Queuing starter pairs preserves occupied dates and rolls back completely if a new pair is invalid.

Ranking recovery restores ratings, win/loss records, matchup vote counts and chart snapshots from original recorded rating changes, starting each song at 1500. It preserves votes and historical K-factors, locks out concurrent writes while rebuilding, checks audit consistency before any changes, and records the operation. It does not rerun historical votes using today's K-factor.

Imports use the shape below (1–100 songs, maximum 200 KB). Download the [CSV template](public/catalog-template.csv) or [starter JSON](public/starter-catalog.json). CSV uses matching field names; `providers` is a quoted JSON array. A song can have one entry per supported provider: `youtube`, `spotify`, `apple_music`, or `musicbrainz`. Links must use HTTPS on that provider's official domain. Only active songs with playback links can be scheduled. Optional `releaseDate`, `durationMs` and `artworkUrl` are validated; dates must match the release year and artwork requires an editor's permission confirmation. Omitted optional metadata clears those values during an edit/import.

```json
[
  {
    "id": "respect-aretha",
    "title": "Respect",
    "artistName": "Aretha Franklin",
    "albumName": "I Never Loved a Man the Way I Love You",
    "releaseYear": 1967,
    "genre": "Soul",
    "status": "active",
    "releaseDate": null,
    "durationMs": null,
    "artworkUrl": null,
    "providers": [
      {
        "provider": "youtube",
        "providerSongId": "JzqGZjFnYnA",
        "externalUrl": "https://www.youtube.com/watch?v=JzqGZjFnYnA"
      }
    ]
  }
]
```

## Verification

```sh
npm test
npm run test:db
npx playwright install chromium webkit
npm run test:ui
npm run typecheck
```

Start local Supabase before the database/browser checks. `npm run verify` runs the complete sequence (unit tests, database tests, production build, desktop/mobile browser tests, and TypeScript).

- Unit tests cover the preview credential guard, Elo including rounding ties, streak expiry/date boundaries, UTC windows, catalog/provider validation, and spoiler-free sharing.
- Database tests create and remove a disposable database inside **only** `supabase_db_musicale`. They exercise migration preservation, actual PostgreSQL transactions/RLS, authentication requirements, invalid/time-window votes, concurrent requests/users, streaks, result privacy, admin scheduling/audits/settings, and atomic imports. They do not reset the application's database or accept a hosted URL.
- Browser tests build with isolated local settings, then use actual local magic-link email and persisted voting on desktop/mobile. They cover keyboard voting, reload persistence, clipboard fallback, profiles/history, server admin checks, sign-out, 404s, 320px layouts and automated WCAG accessibility checks. Generated `example.test` accounts and sample votes remain only in the local test project. Screenshots go in ignored `output/`.
- Browser checks never open the external music links. Listening availability and restrictions remain provider-dependent.

Windows verification runs Chromium desktop/mobile and WebKit. Linux CI also runs Firefox. The downloaded Firefox 155 Windows package failed to launch on this machine with a missing `mozglue` side-by-side assembly; it is excluded from Windows defaults rather than reported as verified. Set `MUSICALE_INCLUDE_FIREFOX=1` to exercise it after resolving the browser package. CI uses disposable local infrastructure and no production secrets. Install all three engines with `npx playwright install --with-deps chromium firefox webkit` on Linux.

`npm run test:ui` builds `.next` against the local test backend. Run `npm run build` again before using that folder with your regular environment. No hosted authentication/email delivery or Vercel deployment is implied by local checks.

## Deploy to Vercel

Production is configured at [musicale.alexyoon.com](https://musicale.alexyoon.com), using Vercel and the dedicated Musicale Supabase project. Public sign-in email delivery is confirmed, but hosted sign-in currently fails and is under investigation. [Deployment status](docs/DEPLOYMENT.md) records the configuration and remaining verification.

1. Prepare and apply the database upgrade before directing the new app at the hosted database.
2. Import the repository into Vercel, using the standard Next.js build.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Production only**, and the canonical HTTPS `NEXT_PUBLIC_SITE_URL`. Leave both Supabase variables absent in Preview. Use local Supabase for authenticated tests; cloud staging is deferred. Keep the service-role key out of frontend/application configuration; this app does not require it.
4. Configure Supabase Auth Site URL and the exact production `/api/auth/callback` redirect. Enable email confirmation, configure reliable email delivery, and retain Auth rate limits/cooldowns.
5. Schedule upcoming daily matchups in Admin. When no valid matchup is scheduled, Today shows an explicit empty state; it does not choose a random pair.
6. Verify sign-in, provider link, one vote, persisted result after reload, streak, leaderboard and admin authorization on the deployed environment.

Supabase rate-limits authentication. Voting has a durable budget of ten attempts per account per UTC minute, including failed choices and duplicates. Admin actions allow 30/minute, profile edits five/minute, and analytics 30/minute. Limits live in PostgreSQL across application instances. The private transactional voting function cannot be called directly by API users; its wrapper commits the request count even when the vote fails, returning a safe `error` field in that case. The app handles both transport errors and this field. No IP addresses are stored. Counters older than seven days are removed on subsequent requests.

`GET /api/health` reports public database connectivity (`ready`, `unavailable`, or `preview`) without secrets, account data or daily results. Use it with your existing hosting monitor. It does not verify external playback, email delivery or the editorial queue; inspect the Admin participation/queue screens for those.

## Profile statistics and analytics

Profile history paginates 25 votes at a time. Listening patterns require at least five votes. Favorite artists/genres need three picks and repeated songs need two. Majority agreement and underdog picks use only completed matchups with at least five listeners and appear after five qualifying matchups. Majority uses exact counts, so a rounded 50% display cannot turn a narrow majority into a tie. Every profile query is restricted to the authenticated owner.

Analytics is off by default and enabled per browser on `/privacy`. Do Not Track disables collection. The isolated adapter sends only allowlisted event names; the collector requires same-origin requests and authentication. Anonymous visitors are not collected. Storage contains only UTC day/event counts (not unique visitor measurements); counts older than 90 days are removed on subsequent analytics activity. Request budgets briefly retain account IDs for rate limiting, as disclosed separately in the privacy page. No external analytics account or paid service is needed.

## Music providers and rights

Musicale stores editorial metadata and provider IDs/links. It does not host, proxy, download, cache or redistribute audio. The initial matchup links to [Aretha Franklin's official Respect upload](https://www.youtube.com/watch?v=JzqGZjFnYnA) and [The Beach Boys' official God Only Knows video](https://www.youtube.com/watch?v=NADx3-qRxek), verified October 1, 2026. Artwork uses letter placeholders until permission for supplied artwork is established.

Daily comparison cards and song details support visible YouTube IFrame API players from existing saved provider URLs. Each player loads only after the listener accepts the linked privacy policy and YouTube terms with “Load YouTube player”; playback starts through YouTube's native controls. Other players pause when playback starts, and players are destroyed on navigation or replacement. The full player keeps native controls and has no forced listening cutoff. External links remain available if YouTube is blocked or unavailable. Other providers continue to use external links.

Apply `20261017182638_youtube_playback_events.sql` before rolling out the new analytics events. It preserves historical `preview_started` counts and adds separate link, player-ready, play-state and error counts; none measures audible listening duration. Configure `YOUTUBE_API_KEY` as a server-only secret for saved-video metadata validation and protected admin candidate search. Minimal Made for Kids metadata is cached for 24 hours; custom player tracking stays off for Made for Kids, unknown or stale sources. The IFrame player itself needs no browser API key, and no searches run during page views or votes. See [playback implementation and verification](docs/YOUTUBE_PLAYBACK.md) for live HTTPS evidence, source review, rollout gates and remaining design work. Review current [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies) before release.

Official upload availability is not a blanket license or assurance of regional playback. Confirm recording authorization, regional availability, artwork permissions, provider attribution/terms, and production privacy disclosures before broad launch. Disable unavailable recordings promptly.

## Remaining launch operations and future versions

- Resolve the hosted sign-in failure, then validate voting and persistence. As of October 15, production has migrations `0001`–`0007`, twenty songs and a restored matchup for that UTC day. The sending domain and public email delivery are verified; owner administration and the next-thirty-day production queue remain pending. See [Phase 2 evidence](docs/PHASE_2.md).
- Continue editorial curation toward the brief's suggested 200–1,000 songs; the twenty-source starter catalog and bulk import tools are complete. Verify region-specific playback and artwork permissions before adding content.
- Extend manual assistive-technology/device testing and configure the hosting monitor against `/api/health`.
- Later: pairing strategies, personalized comparisons, friends and tournaments.
