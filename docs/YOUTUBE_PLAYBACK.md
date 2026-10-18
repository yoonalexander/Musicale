# YouTube playback implementation

Integrated on `codex/youtube-playback` with current `main` (`7e86ffc`). The
original Daily-only work is preserved in recovery commit `edecfb0`; its old
validation did not establish compatibility with the current product.

The current-product correction is merged into `main` and deployed to
[musicale.alexyoon.com](https://musicale.alexyoon.com). See
[the production rollout evidence](YOUTUBE_PRODUCTION_2026_10_17.md).
Physical-device and broader account/voting acceptance remain separate gates.

The shared `SongListening` now hosts `SongVideoPreview` in Play, Rank, Daily and
song details. Main's newer welcome, guest sessions, tutorials, private Play
snapshots/scoring, Rank preferences/Elo/history, Daily streaks, Realtime,
catalog discovery and explicitly authorized audio previews are preserved.
No voting or scoring function was replaced. Pair keys already supplied by the
current pages dispose both videos when Play/Rank advances, including the card
whose song remains in Play. Video load/retry/unload controls use `type="button"`
inside the existing vote forms. Audio and YouTube players pause one another.

## Current-product verification

Verification uses a new `musicale-youtube-integration` backend under ignored
`tmp/youtube-integration`, on API 61321, PostgreSQL 61322 and email 61324.
Existing local databases and hosted data are preserved. Docker Desktop required
an owner-approved restart to recover its hung management API. No data volume was
removed. All seventeen migrations and the revised seed applied to the fresh
backend.

| Check                                         | Current-product result                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit, catalog, monitor and YouTube API checks | 43 passed                                                                                                                                                       |
| Full database suite                           | 93 passed, including fresh/legacy/incremental migrations, authorization, mixed-mode recovery, Play, Rank, audio and readiness                                   |
| Production build and TypeScript               | Passed with all three current mode routes                                                                                                                       |
| Formatting and whitespace                     | Passed                                                                                                                                                          |
| Private logical backup/restore                | Passed; application/Auth/migration rows, permissions, constraints, identity isolation and songs-only Realtime restored, source unchanged                        |
| Local security advisors                       | No ERROR findings; inherited `public.set_updated_at` mutable-search-path WARN remains                                                                           |
| Standard browser coverage                     | 129 current non-network cases observed passing across the full run and focused runs; final YouTube group: 36 passed across Chromium, WebKit and mobile Chromium |
| Focused Linux Firefox                         | 17 passed, including real audio, sign-in, guest, Play, Rank and all YouTube integration checks; one network case skipped                                        |
| Native YouTube                                | Dynamite reached native PLAYING after a native play gesture, with no player API mock                                                                            |
| Actual server key                             | Fresh normal and Made for Kids metadata reached the current players; the key was absent from both HTML responses                                                |

Browser regressions use the existing server fetch fixture with a dummy YouTube
key; it intercepts metadata and search requests and cannot consume real quota.
Player API lifecycle tests also use explicit browser mocks. An opt-in native
YouTube test is kept separate from those checks. Unit coverage includes unknown,
Made for Kids, mismatched, expired and future-dated metadata.

This host's Windows WebKit runtime reports `AudioContext` as undefined. Its
cross-media case therefore checks the unavailable-audio fallback and continued
YouTube usability. Chromium verifies real authorized-audio coordination. This
does not establish audio playback on actual Safari/iOS hardware.

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
ID. A bounded 1,000-entry warm-instance memo keeps vote-triggered route
revalidation from refetching fresh metadata; it retains the original check time.
Missing/failed validation backs off for one minute. Cold instances can still
refetch after route invalidation; persist validation records before large
multi-instance traffic or scheduled inactive-source validation. There are no
searches on page views or votes. Player/link tracking requires
fresh metadata for the same ID explicitly marked not Made for Kids; age is
checked at event time. The API marks 99 Luftballons as Made for Kids, so custom
tracking stays disabled there. Unknown, stale or failed validation also disables
tracking without blocking voting or native playback.

The running app was checked with the real server key: normal and Made for Kids
flags reached their players correctly, and neither HTML response contained the
credential. Builds blank the key; browser tests use the isolated fixture above
to avoid live quota consumption.
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

`supabase/migrations/20261018001728_youtube_playback_events.sql` only expands
the aggregate analytics event constraint and existing recording function. It
keeps existing permissions, retention and request limits. Apply it before
deploying clients that send new event names. No catalog/data migration is needed.

Main's existing migration maps historical `preview_started` counts to
`listening_link_clicked`. The YouTube migration preserves this legacy-client
mapping, both authorized-audio event names and existing aggregate counts. New
listening links send `listening_link_clicked`; iframe events send
`youtube_player_ready`, `youtube_play_started`, and `youtube_player_error`.
Events retain the existing analytics opt-in and Do Not Track behavior, plus the
Made for Kids and freshness safeguards described above. PLAYING
can include ads and is not evidence of audible music or listening duration.

The migration was applied to production before the client deployment. The
Supabase connector assigned version `20261018001728`; the repository filename
matches that applied history. Existing canonical versions were preserved.

## Local development

Restart `npm run dev` in the original project directory to see the newer
frontend. The correction preserves your `.env.local` values. Blank Supabase URL
and anon-key values still select read-only preview mode; they do not select an
older design. Full guest Play, Rank and Daily persistence were verified against
the configured isolated backend described above.

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

Set `$env:MUSICALE_LOCAL_WORKDIR = 'tmp/youtube-integration'` for the selected
isolated backend before the commands above. Database tests create and remove
disposable databases, preserving
the application's local database. Mocked player tests check coordination,
minimum dimensions, retry, script sharing, pending initialization cancellation
and cleanup. They are not playback or availability evidence.

## Remaining design milestones

Production rollout and deployed-app playback smoke checks are recorded in the
[production evidence](YOUTUBE_PRODUCTION_2026_10_17.md). Broader physical-device,
real account, voting and operational acceptance remain open.
Persisted candidate/rejection history, backup source selection, curated start
timestamps/replay and scheduled validation of inactive sources remain design
work. Current metadata refresh runs on access, with a 24-hour cache.

The manual discovery run used one search request followed by candidate metadata
validation. Other live API requests checked the twenty saved videos, recording
context and server rendering, including one corrected field-selector request.
No automatic search retries were made. Google Cloud's quota counters remain the
authoritative usage total. The IFrame player itself requires no Data API key.

The owner configured the server key for Vercel Production. Continue reviewing
data retention/refresh, regional availability and actual device playback.
This is engineering evidence, not YouTube or legal approval.

The current [IFrame API reference](https://developers.google.com/youtube/iframe_api_reference)
informs lifecycle, sizing, error and origin handling. The
[Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
inform the privacy/terms disclosure and user-controlled player. This is an
engineering review, not a policy approval. Before production, review current
policies and each recording's suitability. Timed playback remains disabled.

## Verification provenance and limits

The initial full current-product run completed 129 cases in 27.9 minutes:
124 passed, three native-network cases skipped, and two WebKit failures. The
live-update timing case measured 5.077 seconds against an unchanged five-second
target. Three isolated reruns passed at 2.429-2.881 seconds; the final cache
implementation passed again at 1.671 seconds for the app vote and 1.321 seconds
for the direct RPC. The player cleanup test checked immediately after the URL
changed. It now polls for actual destruction; three repeated WebKit checks and
the final three-project YouTube group passed. No player cleanup behavior was
removed to satisfy the test.

A separate quota probe reproduced two metadata requests after an already-warm
Daily vote. The bounded memo fixed this without changing the metadata's check
time. The same probe changed from zero-before/two-after to zero-before/zero-after.
The permanent regression passed in Chromium, WebKit, mobile Chromium and Linux
Firefox. The final 39-case YouTube run passed all 36 non-network cases, with
three native-network cases deliberately skipped. These results and the existing
product coverage establish 129 distinct passing standard-browser cases across
the full and focused runs, rather than one clean full-suite invocation.

The 17 Firefox checks ran in the cached Linux browser image through a
localhost-only service and loopback forwarding. The image received only the
installed Playwright packages, not project credentials. This is focused Firefox
coverage, not a full Firefox suite or a physical-device test.

The separately enabled native Chromium test passed against the corrected app.
PLAYING may include an ad; no claim of human-audible music, completion or
ad-free playback is made. Test fetch caches were cleared before the actual-key
rendering check so fixture metadata could not satisfy it. That check fetched
fresh metadata for Dynamite and 99 Luftballons, confirmed their differing kids
flags and checked that neither HTML response contained the server key.

Private execution logs remain under ignored tmp/youtube-integration-_.log.
Public diagnostic metadata and the credential-free rendering result are in
output/youtube-data-validation.json, output/youtube-superstition-candidates.json,
output/youtube-origin-probe.json, output/youtube-hosted-catalog-probe.json and
output/youtube-current-product-real-key.json. Current welcome screenshots use
output/_-youtube-current-welcome.png; mode screenshots use output/_-youtube-_.png.
The native playback screenshot is output/youtube-real-playback.png.

No new dependency was added. Main's homepage, navigation, mode route files,
Daily component and Play/Rank pair components compare unchanged against main;
the shared listening component supplies the integration. The original design
and initial implementation remain recoverable in edecfb0. User environment
values were preserved. The local correction did not change hosted state;
the subsequent owner-authorized production publication is recorded separately.

The temporary Firefox service and only the task-owned verification backend
were stopped after the checks. Backend data volumes, private restore evidence
and useful ignored diagnostics are preserved; other local projects remain
running. The configured key was also checked against the staged diff, and
`.env.local` remains untracked.
