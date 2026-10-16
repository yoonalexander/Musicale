# Automated catalog discovery and authorized previews

Implemented locally on `automated-music-catalog`, based on completed Phase 4 (`db78716`). This addition preserves the existing catalog/editor, JSON/CSV imports, daily scheduling, voting, Elo, audit history and live leaderboard. Production and the Phase 2 hosted sign-in investigation are unchanged.

## Data flow

Admin search → server-side provider adapter → normalized candidates and database duplicate review → editor chooses recordings → server re-fetches selected recording IDs → one atomic `ingest_catalog` transaction.

`CatalogAdapter` defines search and lookup against a normalized `CatalogCandidate`. The first adapter is MusicBrainz. Provider-specific response parsing lives in `lib/music-catalog.ts`; the shared database import uses identifiers and normalized fields, not raw MusicBrainz responses. No new dependency, worker, scheduled crawler or music account credential is required.

The adapter extracts titles, credited artists and artist IDs, albums, release years/dates, duration, recording IDs, ISRCs and typed official streaming relationships. Full dates are retained only when valid; a year-only date remains a year. Recordings without the required title, artist or valid release year are omitted from search results rather than assigned invented metadata. Search pages contain at most ten candidates; imports contain one to ten recordings. Incremental pages and repeated imports add/update records without replacing the catalog.

## Identity, refresh and preservation

`0010_catalog_discovery.sql` adds private, admin-readable `catalog_sources`, storing provider/recording identifiers, ISRCs, normalized source snapshots, attribution/license and `synced_at`. Existing IDs and provider rows are retained.

- Primary provider IDs, associated listening-provider IDs and ISRCs identify existing songs. Multiple conflicting identifier matches stop the whole import for review.
- Normalized Unicode title/artist matches are possible duplicates, not automatic merges. An editor explicitly attaches the recording to a listed song or creates a separate recording. Distinct recordings can share a title and artist.
- New IDs use the recording identifier (`mb-<recording UUID>`); new songs start **unavailable**. An editor verifies listening links before activating/scheduling them.
- Imports serialize catalog identity resolution in PostgreSQL. Repeating or concurrently submitting the same import creates one song. Source timestamps/audits advance; voting data does not change.
- Legacy songs default to no automatically managed fields. Attaching MusicBrainz enriches their source records and adds missing provider associations without replacing editorial metadata.
- Discovery-created fields remain automatically managed until edited. Direct editorial changes remove changed fields from automatic management. Saving through the song editor or JSON/CSV import makes the full metadata record editorial; subsequent discovery refreshes preserve it. Availability, artwork, IDs, existing provider links and rating statistics are never automatically overwritten.
- Source refreshes retain previous links. This intentionally leaves link replacement/removal to the existing editor rather than silently removing an editorial choice when a provider response is incomplete.

Request reservations are enforced inside the database mutation, outside the business subtransaction. A failed batch rolls back every catalog/source/provider write while retaining its attempt counter. Network search/import preparation also reserves the existing admin budget; the final import reserves separately. A shared database slot spaces MusicBrainz calls by at least 1.1 seconds across application instances; short bounded waits handle contention. Provider errors/timeouts return a retryable message and leave imports unchanged. The app cannot coordinate unrelated software sharing its outbound IP.

The Admin page requests a sixty-second hosting execution limit for its server actions, following [Next.js 15 page-level duration configuration](https://nextjs.org/docs/15/app/api-reference/file-conventions/route-segment-config#maxduration). Hosting support still needs deployment verification. If a provider is slow or a request times out, retry a smaller selection; idempotent identifiers make retries safe.

## Provider evaluation and content rights

Reviewed against these primary sources on October 16, 2026:

- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting) and [data license](https://musicbrainz.org/doc/About/Data_License): core recording/release/artist/identifier metadata uses CC0. The adapter identifies Musicale in its User-Agent. Supplementary genres/tags/ratings have different licensing and are **not imported**; genres remain editorial. Check the hosted API's commercial-use arrangement before commercial operation; a CC0 data license does not remove service access conditions.
- [Apple iTunes Search API](https://performance-partners.apple.com/search-api): useful supplementary discovery, store IDs, durations, genres, artwork and preview fields; approximately twenty calls/minute. Apple's documentation restricts promotional previews/artwork to promoting store content rather than entertainment. Musicale's voting experience is not assumed to qualify. **iTunes is evaluated but not enabled**, and no returned preview/artwork URL is treated as authorization. Add an adapter only after establishing an applicable use/permission arrangement. Existing Apple Music external links are unaffected.
- MusicBrainz does not license cover art as part of its core dataset. A release can yield a Cover Art Archive reference, stored as **availability unknown / permission unreviewed**, not proof that an image exists or may be displayed. Search shows the release/source link without loading its images. Editors can supply authorized artwork through the existing permission-confirmed editor; source URL and attribution are now recorded and displayed. No artwork is automatically copied or approved.

No starter recording is granted new audio or artwork rights by this migration. All twenty existing YouTube links remain external destinations.

## Audio interface

`song_audio_sources` stores provider, direct HTTPS URL, availability (`unknown`, `available`, `unavailable`), licensing status (`unreviewed`, `authorized`, `rejected`), public authorization evidence, attribution, reviewer and review time. These are independent of external listening links and song availability.

Only authorized, available rows with an HTTPS source, authorization evidence and attribution are playable. Public RLS excludes unreviewed/rejected/unavailable records; reviewer identity is not part of the public projection. The admin form requires explicit confirmation of permission **for Musicale's use**, and changes are audited. An administrator's review is the authorization decision; the application cannot establish copyright permission by inspecting a URL.

`SongListening` is shared by daily cards and song pages. It supports direct browser-playable sources independently of provider name, uses native accessible controls and `preload="none"`, and never auto-plays. Sources needing a provider-specific iframe/SDK are not automatically adapted into raw audio. No YouTube or Apple preview is embedded by default. Failed playback produces a visible message while retaining official listening links. Region, codec, expiry and provider availability remain source-dependent; an editor can disable a preview without removing the song or its links.

Musicale does not fetch, download, proxy, cache or rehost third-party audio. Pressing play makes the browser contact the approved source; the privacy page explains this. Evidence and attribution appear publicly for approved sources, so editors must use public evidence URLs without secrets.

## Admin workflow

1. Open **Discover music**, search MusicBrainz and inspect the recording, release/date, identifiers, source attribution and duplicate suggestions.
2. Choose individual recordings or a reviewed batch. Resolve metadata matches explicitly. Import re-fetches provider records and rechecks identities transactionally; a newly discovered conflict stops the import.
3. Open the existing song editor, verify/provide official listening links and optional authorized artwork, then activate the song. Existing scheduling and manual imports remain available.
4. Use **Imported sources and metadata refresh** to refresh individual source records while preserving editorial fields.
5. Use **Audio availability and authorization** to inspect or record preview status. Leave it unreviewed unless explicit permission has been established. Approve only with evidence and attribution; mark unavailable/rejected to remove public playback.

Discovery does not automatically schedule songs, crawl an entire external library, replace the curated starter file or approve content rights.

## Analytics

- `listening_link_clicked`: external playback-link clicks on both daily and song pages. MusicBrainz information links are excluded.
- `preview_play_started`: native `playing` event, once per mounted preview; displaying/loading controls and pressing pause/resume do not manufacture additional starts.
- `preview_play_failed`: native media error and visible fallback.

Existing consent, Do Not Track, authenticated-only aggregation and request limits remain. Migration 0010 moves historical `preview_started` counts into `listening_link_clicked`, preserving totals; those historical events were outbound clicks. The HTTP endpoint and SQL event function alias the old name for older open tabs/deployed application versions.

## Verification evidence

Local evidence on October 16:

- 23 unit cases passed (19 existing, four catalog/audio cases).
- The existing 45 database cases passed with the catalog migration: daily voting, concurrent requests, RLS, Elo, replay recovery, scheduling, manual imports and historical migration preservation. All seven new catalog database cases also passed, including a final rerun after input/permission tightening: populated 0009 upgrade, reviewed duplicates, Unicode/provider/ISRC matching, concurrent idempotency, protected edits, failed-batch rollback, admin authorization, shared provider pacing, private reviewer identity and separate analytics counts.
- Production build, final TypeScript check and dependency audit passed; audit reported zero vulnerabilities.
- The focused desktop catalog browser workflow passed, including authorized synthetic playback, no pre-play audio requests, actual media failure fallback, legacy analytics compatibility and replayed unauthorized server actions. The existing offline/navigation cleanup case passed when run alone. Cross-browser live updates were observed at 1,019 ms for an app vote and 1,403 ms for a direct RPC vote in the regression run; these are local measurements, not production capacity guarantees.
- The desktop discovery screenshot was inspected. Automated accessibility and layout checks are included for the new admin UI.
- A full local Windows browser pass is **not claimed**: broader runs hit admin navigation/subscription timing failures, and Windows WebKit reported unsupported synthetic WAV playback. The test verifies unsupported-codec fallback on Windows WebKit and retains actual playback assertions elsewhere. The catalog backend was stopped without changing other projects. Clean Linux CI is the full-regression gate recorded below.

Automated browser checks use a test-server-only MusicBrainz fixture and synthetic WAV generated in memory. They never contact music playback providers or download a recording. The production application has no fixture flag or fixture endpoint. Test waits for the thirty-day admin queue and server-side cleanup of deliberately severed sockets were bounded separately from the unchanged five-second live-ranking acceptance target. The native song-ID pattern was corrected for browsers using Unicode-set HTML pattern validation.

Linux CI provides a [PulseAudio clocked null sink](https://wiki.freedesktop.org/www/Software/PulseAudio/Documentation/User/Modules/) for real headless playback. The preceding Firefox trace reported `NS_ERROR_DOM_MEDIA_MEDIASINK_ERR` / `OnMediaSinkAudioError` after the initial playing event; the UI correctly removed the failed player. CI supplies the audio output and keeps native playback assertions. The unavailable-source test uses a distinct URL returning HTTP 404, avoiding Firefox's decoded media cache across reloads. The test also waits for refreshed saved audio status before navigating away from Admin.

CI result: pending the review branch's first clean run.

Read-only live provider smoke check on October 16: actual MusicBrainz search for Respect/Aretha returned 118 results and ten normalized candidates; lookup returned the expected title/artist and a valid source record. No live result was imported. ISRCs and external playback relationships are not guaranteed on every recording.

## Rollout

Apply unapplied migrations in order through **0010 before deploying this application's matching code**. Do not reapply historical migrations or reset a hosted database. The migration preserves current rows, introduces empty source/audio tables, retains all ratings/history and appends compatible public view projections. Rolling back the UI does not require deleting source or audio data; the old application continues using existing song/provider fields. No hosted migration/deployment is part of this work.

For isolated local checks, create a separate ignored project using the Phase 4 procedure, replacing its project ID with `musicale-catalog`, and set `MUSICALE_LOCAL_WORKDIR=tmp/catalog-local`. Its ports are 56321/56322/56324. Run `npm ci`, `npm run verify`, and `npm audit`; stop that specific backend afterward. Other local projects are not reset or migrated.
