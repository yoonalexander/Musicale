# YouTube playback implementation

Implemented on `codex/youtube-playback` for the Daily-only application in this
checkout. The supplied design also describes Play and Rank comparison screens;
those screens do not exist on this branch. The shared `SongVideoPreview` is used
in Daily comparison cards and individual song details.

## October 17 API and HTTPS update

The configured server key is valid. The Data API marks all twenty original
videos as embeddable. Browser-only diagnostics on Musicale's existing HTTPS
origin reached PLAYING for nineteen originals, including Respect, Fast Car and
99 Luftballons. The previous eighteen local HTTP failures therefore do not
establish global embedding prohibitions. These diagnostics added native players
only in the browser DOM; they did not deploy code or change hosted data.

Superstition's original source `egqv1mtos6A` still failed there and has an allowed
country list excluding Canada. The reviewed replacement `ftdZ363R9kQ` is the
UMG-provided Stevie Wonder Topic upload of Talking Book's 1972 Motown recording,
duration 4:27. Its metadata explicitly allows Canada, and it reached PLAYING on
the HTTPS origin. The shorter Number 1's candidate was not selected. The starter
catalog, download and generated seed now use the Talking Book source, giving
PLAYING evidence for all twenty selected starter sources on that origin. One new
source was selected after metadata and playback review; song IDs and votes are
preserved. Repeat seeding preserves
existing database providers, so those require an explicit editor save/import.

Server-side metadata validation and admin candidate search are implemented.
Search requires the existing admin authorization and request budget. Selecting
a candidate fills the current editor's ID and URL; saving uses the existing
atomic catalog action. Results expose channel, duration, country restrictions
and Made for Kids status for review; they are never automatically published.

Saved-video validation caches minimal Made for Kids metadata for 24 hours per
ID. There are no searches on page views or votes. Player/link tracking requires
fresh metadata for the same ID explicitly marked not Made for Kids; age is
checked at event time. The API marks 99 Luftballons as Made for Kids, so custom
tracking stays disabled there. Unknown, stale or failed validation also disables
tracking without blocking voting or native playback.

The running app was checked with the real server key: normal and Made for Kids
flags reached their players correctly, and neither HTML response contained the
credential. Test runs explicitly blank the key to avoid live quota consumption.
No production migration, push or deployment has been performed.

### Core player behavior

- Saved provider URLs supply the video ID. All starter records normalize to
  their stored IDs. The one reviewed Superstition starter association changed
  as described above; existing database associations and votes were preserved.
- Each player requires an explicit load click accepting the linked privacy
  policy and YouTube terms. No YouTube script, thumbnail or iframe loads first.
  The listener then uses YouTube's native play control. No page-load or
  next-matchup autoplay is enabled.
- One shared API script and player registry coordinate playback. Other ready
  players pause on PLAYING or BUFFERING; hidden-tab playback pauses. Unloading,
  navigation and changed song/video identity destroy the old player. Pending
  initialization cannot resurrect an unmounted player.
- Visible players keep native controls and branding, with a minimum 200 × 200
  CSS-pixel viewport and responsive 16:9 layout where space permits. Status
  messages and Musicale buttons sit outside the iframe.
- Blocked scripts, initialization timeouts and YouTube errors offer retry and
  retain existing provider links. Voting is never gated by player state.
- No forced 15-second cutoff, suggested timestamp/replay behavior, audio
  extraction, hidden video, public playback search or new dependencies.

## Database and rollout

`supabase/migrations/20261017182638_youtube_playback_events.sql` only expands
the aggregate analytics event constraint and existing recording function. It
keeps existing permissions, retention and request limits. Apply it before
deploying clients that send new event names. No catalog/data migration is needed.

`preview_started` remains accepted for old clients and historical rows. New
Daily links send `listening_link_clicked`; iframe events send
`youtube_player_ready`, `youtube_play_started`, and `youtube_player_error`.
Events retain the existing analytics opt-in and Do Not Track behavior, plus the
Made for Kids and freshness safeguards described above. PLAYING
can include ads and is not evidence of audible music or listening duration.

The migration has only been exercised in a disposable local database. No
production migration, push or deployment is part of this change.

## Verification commands

```powershell
npm test
npm run test:db
node tests/build-local.mjs
npx playwright test tests/browser/youtube-playback.spec.ts
$env:MUSICALE_REAL_YOUTUBE = '1'
npx playwright test tests/browser/youtube-playback.spec.ts --project=desktop --grep 'real catalog'
Remove-Item Env:MUSICALE_REAL_YOUTUBE
npm run typecheck
```

The existing local Supabase stack on port 55321 is required by the browser
configuration. Database tests create and remove a disposable database, preserving
the application's local database. Mocked player tests check coordination,
minimum dimensions, retry, script sharing, pending initialization cancellation
and cleanup. They are not playback or availability evidence.

## Remaining design milestones

Production rollout and deployed-app acceptance remain pending. An injected
native-player diagnostic is not deployed-app sign-in/voting/player acceptance.
Persisted candidate/rejection history, backup source selection, curated start
timestamps/replay and scheduled validation of inactive sources remain design
work. Current metadata refresh runs on access, with a 24-hour cache.

The manual discovery run used one search request followed by candidate metadata
validation. Other live API requests checked the twenty saved videos, recording
context and server rendering, including one corrected field-selector request.
No automatic search retries were made. Google Cloud's quota counters remain the
authoritative usage total. The IFrame player itself requires no Data API key.

Before rollout, configure the server key in the hosting environment and review
data retention/refresh, privacy implementation, regional availability and actual
device playback. This is engineering evidence, not YouTube or legal approval.

The current [IFrame API reference](https://developers.google.com/youtube/iframe_api_reference)
informs lifecycle, sizing, error and origin handling. The
[Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
inform the privacy/terms disclosure and user-controlled player. This is an
engineering review, not a policy approval. Before production, review current
policies and each recording's suitability. Timed playback remains disabled.

## Verification results before the API/HTTPS update (October 17, 2026)

- 21 unit checks passed, including all 20 saved ID/URL associations and
  single-player coordination.
- 22 disposable-database integration tests passed, including the analytics
  migration, vote/Elo atomicity, import preservation and authorization.
- Production build, TypeScript and formatting checks passed. There is no
  separate lint script in this repository; the Next production build performed
  its built-in validation.
- All nine non-network playback checks passed across desktop Chromium, WebKit
  and mobile Chromium. They cover click-to-load, coordination, minimum player
  size, fallback, retry, script reuse, cleanup and cancelled initialization.
- Session-expiry, both UTC-rollover modes and 320px accessibility checks passed
  in all three browser projects on rerun. The initial WebKit accessibility run
  exceeded its 45-second budget; its isolated rerun passed.
- Full sign-in, keyboard voting, results/sharing, persistence, profile editing
  and administration flows passed in desktop Chromium, WebKit and mobile
  Chromium after the fixture corrections. Across the initial full run and
  targeted reruns, all 36 non-network browser cases passed. This was not a
  single clean full-suite run. The separately enabled live Chrome BTS test
  also passed; network playback tests remain opt-in in the default suite.
- Live installed-Chrome checks loaded all 20 catalog players without API mocks.
  Dynamite and Sastanàqqàm reached PLAYING after a native “Play video” click.
  This is player-state evidence, not proof of audible music, song completion,
  or absence of ads. Screenshots are in `output/youtube-*-playing.png`.
- The other 18 songs returned the embedding-disabled error in this environment:
  Respect, God Only Knows, Dreams, Superstition, Fast Car, Juicy, Crazy in Love,
  Paper Planes, Alright, bad guy, Waka Waka, Alors on danse, Last Last,
  99 Luftballons, One More Time, Despacito, Three Little Birds and Sodade.
  Detailed local results are in `output/youtube-catalog-smoke.json` and
  `output/youtube-playable-sample-smoke.json`. No stored IDs were silently
  replaced, no rejected song was removed, and no new recording was approved.
- The first full browser run exposed date-dependent test fixtures: voting tests
  assumed today's pair was Respect/God Only Knows, while the preserved local
  database served Fast Car/99 Luftballons on October 17. The tests now read the
  actual pair from the isolated local database. This changes test expectations,
  not the scheduled matchup or its votes.
- The queue assertion now counts occupied days, including existing cancelled
  days that the scheduler deliberately preserves. It still checks that repeat
  queueing preserves all existing pairs.
- Actual Firefox, iOS Safari and Android devices, hosted sign-in/voting, and
  regional playback have not been verified. WebKit/Chromium emulation cannot
  substitute for those checks.

## Changed files

The API/HTTPS increment additionally changes `lib/youtube-data.ts`,
`lib/youtube-validation.ts`, `lib/data.ts`, `types/domain.ts`, `app/actions.ts`,
`components/youtube-discovery.tsx`, `components/catalog-editor.tsx`,
`.env.example`, `data/songs.json`, `public/starter-catalog.json`,
`supabase/seed.sql`, `docs/CATALOG.md`, `tests/youtube-data.test.ts`,
`tests/local-env.mjs` and `package.json`. No new dependency was added.

Increment evidence: `output/youtube-data-validation.json`,
`output/youtube-superstition-candidates.json`, `output/youtube-origin-probe.json`
and `output/youtube-hosted-catalog-probe.json`. Twenty-two pure unit checks plus
five async API-service tests passed. Production build, TypeScript and formatting
passed. All 22 disposable-database integration tests passed again with the
revised seed and analytics migration.

All 12 player lifecycle and tracking cases passed across desktop Chromium,
WebKit and mobile Chromium. The mobile sign-in/voting/admin flow also passed,
including the missing-key discovery error. Desktop's combined flow exceeded its
initial 90-second budget, while WebKit's browser closed during accessibility
checking. Their final rerun with a longer budget stalled inside a synchronous
local Docker/psql command; an independent Docker diagnostic also stalled while
the app health endpoint remained ready. Only this task's runner and diagnostic
processes were stopped. These two final flow reruns remain unverified; there
was no failed product assertion establishing an application defect.

- `lib/youtube.ts`: official URL normalization, API loader, errors and registry.
- `components/song-video-preview.tsx`: shared visible player, consent/load
  action, events, retry, unloading and cleanup.
- `components/daily-matchup.tsx`, `app/songs/[id]/page.tsx`, `app/globals.css`:
  integration and player sizing.
- `lib/analytics.ts` and the analytics migration: explicit aggregate events.
- `app/privacy/page.tsx`, `README.md`, this report: disclosures and rollout.
- `tests/run-tests.ts`, `tests/database.mjs`,
  `tests/browser/daily-flow.spec.ts`, `tests/browser/youtube-playback.spec.ts`:
  regression verification, date-independent voting fixtures and an opt-in real
  YouTube smoke test.
