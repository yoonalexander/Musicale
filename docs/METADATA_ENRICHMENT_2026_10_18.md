# Album metadata enrichment — October 18, 2026

Historical initial-pass report. See the [follow-up implementation and current status](METADATA_ENRICHMENT.md) for the production worker, daily schedule and review improvements.

Status: metadata backfill is saved in production; frontend publication, ongoing scheduling and artwork permission review remain incomplete.

## Live catalog results

| Measure | Count |
| --- | ---: |
| Existing songs processed | 64 |
| Automatically enriched | 36 |
| Flagged for administrator review | 19 |
| No safe match | 9 |
| Failed jobs after retry | 0 |
| Matched covers found but awaiting permission | 25 |
| Published covers | 0 |
| Songs still without artwork | 64 |
| Songs without verified original recording dates | 28 |
| Songs without full YYYY-MM-DD dates | 31 |
| Songs with album placeholder “Single” | 2 |
| Songs without an editorial genre | 0 |

Partial dates remain partial in `songs.metadata_details.originalDate` and `albumDate`; they are never fabricated into January 1 dates. Full original dates populate the existing `release_date` only when consistent with the existing editorial year. Existing years, album names and genres are preserved; placeholders and null duration/date fields may be filled. “Album edition” is the matched release's date, not a claim about every edition of that album.

Six representative songs were validated before the full pass: Respect, bad guy, Dynamite, Alors on danse, Blinding Lights and Africa. The first unrestricted Africa search result was a live video; the matcher rejected it. Two representative songs auto-matched, three required review and one remained unmatched. The full pass used finite, sequential requests spaced at least 1.1 seconds apart, then five-song database transactions. Nirvana and Cesária Évora initially encountered Cover Art Archive HTTP 500 responses; bounded retries succeeded.

## What changed

- `lib/metadata-enrichment.ts`: normalized identity matching, ISRC/recording ID priority, original-year/album/duration conflict checks, alternate/video/compilation rejection, competing-candidate review, full server lookup verification, partial dates, CAA front-cover discovery, bounded retries and per-job request caching. Missing genres can produce explicitly licensed supplementary suggestions for editorial review.
- `lib/metadata-jobs.ts`: shared leased worker, database-backed provider slots, reviewed association pinning, durable status/results and retries.
- `supabase/migrations/20261018080521_metadata_enrichment.sql`: additive public metadata JSON, private admin job queue, insert/title/artist-change queueing, claim/finish/retry RPCs, private worker configuration, permission-gated artwork approval, existing view extension. No song/provider reconstruction.
- `supabase/migrations/20261018081732_metadata_artwork_privacy.sql`: artwork permission evidence and reviewer identity stay in the admin-only job table.
- `supabase/functions/enrich-metadata/index.ts` and `deno.json`: deployed background worker, maximum three songs per invocation. It authenticates the private header against server-only configuration; JWT verification is disabled because this is custom server authentication. Public requests were verified to return HTTP 401.
- `app/metadata-actions.ts`, `components/metadata-enrichment.tsx`, `app/admin/page.tsx`: progress, next-five batch processing, per-song/catalog retry, candidate review, server-refetched recording/release corrections, genre suggestions and artwork permission approval. Existing CatalogEditor remains the manual metadata/artwork override tool.
- `components/song-artwork.tsx`, `components/song-choice.tsx`, `components/daily-matchup.tsx`, `components/live-leaderboard.tsx`, `app/songs/[id]/page.tsx`: shared lazy, direct-source artwork and failed-image fallback without changing layout. Song detail distinguishes original recording and album edition dates and links to provenance.
- `lib/data.ts`, `types/domain.ts`: expose saved provenance to the application.
- `package.json`, `tsconfig.json`: wire regression tests and keep Deno functions out of the Next.js typecheck.
- `tests/metadata.test.ts`, `tests/metadata-jobs.test.ts`, `tests/metadata-database.mjs`, `tests/browser/metadata.spec.ts`: matching, provider, worker, transaction, authorization, lease, manual-edit, private evidence, progress and broken-image regressions.
- `tests/catalog-database.mjs`, `tests/rank-database.mjs`, `tests/audio-database.mjs`: historical migration snapshots account for the additive null metadata column.
- `scripts/metadata-sample.ts`: repeatable read-only six-song provider sample.
- `supabase/optional/metadata_worker_schedule.sql`: prepared scheduler, deliberately outside normal migrations and NOT applied in production.

A pre-backfill song/provider/catalog-source snapshot and credential-free provider outputs are in ignored `output/metadata-pre-backfill.json`, `output/metadata-input.json`, `output/metadata-sample.json`, and `output/metadata-backfill.json`. These are operational evidence, not committed catalog fixtures.

## Preservation evidence

Live checks before and after the initial full pass matched:
- 64 song IDs; ratings/counters MD5 `94bc53512a03e8c67c2fd94feb5ac0a6`.
- Provider associations MD5 `372d12954d8d7e094968ef0458b19bdc`.
- Daily schedule MD5 `e25bea8fc7a58ed49b16275f4f3e800a`.
- One existing Daily vote and 18 Rank votes. No production votes or guesses were created for testing.
- Final post-retry verification matched all three hashes again and found zero recording IDs associated with multiple catalog songs.

## Administrator review

No competing recordings were arbitrarily accepted. These cases need recording/edition evidence; some are identity ambiguities and some are album/year conflicts.

| Song | Artist | Candidates | Highest confidence | Reason |
| --- | --- | ---: | ---: | --- |
| Alright | Kendrick Lamar | 2 | 97% | Exact title and artist; album and original year agree. |
| bad guy | Billie Eilish | 2 | 97% | Exact title and artist; album and original year agree. |
| Blank Space | Taylor Swift | 1 | 97% | Exact title and artist; album and original year agree. |
| Crazy in Love | Beyoncé | 2 | 75% | Album, year or duration differs; review the recording and edition. |
| DDU-DU DDU-DU | BLACKPINK | 1 | 75% | Album, year or duration differs; review the recording and edition. |
| Dynamite | BTS | 1 | 90% | Exact title and artist; album and original year agree. |
| God Only Knows | The Beach Boys | 4 | 97% | Exact title and artist; album and original year agree. |
| Hey Ya! | Outkast | 2 | 97% | Exact title and artist; album and original year agree. |
| I Will Always Love You | Whitney Houston | 1 | 75% | Album, year or duration differs; review the recording and edition. |
| Karma Police | Radiohead | 2 | 97% | Exact title and artist; album and original year agree. |
| Numb | Linkin Park | 1 | 97% | Exact title and artist; album and original year agree. |
| Respect | Aretha Franklin | 2 | 97% | Exact title and artist; album and original year agree. |
| Rolling in the Deep | Adele | 1 | 97% | Exact title and artist; album and original year agree. |
| September | Earth, Wind & Fire | 1 | 75% | Album, year or duration differs; review the recording and edition. |
| Shake It Off | Taylor Swift | 1 | 97% | Exact title and artist; album and original year agree. |
| Uptown Funk | Mark Ronson feat. Bruno Mars | 1 | 97% | Exact title and artist; album and original year agree. |
| Viva la Vida | Coldplay | 1 | 97% | Exact title and artist; album and original year agree. |
| Waka Waka (This Time for Africa) | Shakira feat. Freshlyground | 1 | 75% | Album, year or duration differs; review the recording and edition. |
| Yellow | Coldplay | 1 | 97% | Exact title and artist; album and original year agree. |

Unmatched: Alors on danse — Stromae; Despacito — Luis Fonsi feat. Daddy Yankee; Gangnam Style — PSY; Get Lucky — Daft Punk feat. Pharrell Williams and Nile Rodgers; Levitating (feat. DaBaby) — Dua Lipa feat. DaBaby; Gymnopedie No. 1 — Kevin MacLeod; Gymnopedie No. 2 — Kevin MacLeod; Gymnopedie No. 3 — Kevin MacLeod; Hall of the Mountain King — Kevin MacLeod. The four existing open-license recordings were preserved. Exact title/artist matching intentionally leaves transliterations, featured-artist differences and unsupported alternate recordings for manual association rather than guessing.

## Validation

- Next.js production and local-backend builds succeeded; final build/typecheck status is recorded in the chat.
- Unit/API suite passed; 11 focused metadata/matcher/worker tests passed.
- Disposable database suites passed individually: 22 core, 14 integrity, 4 recovery, 5 migrations, 7 catalog, 13 Rank, 13 Play, 7 audio, metadata integration, 8 readiness. The first aggregate run exposed historical snapshot assertions that compared schema shape across all later migrations; those assertions were updated and their suites rerun successfully.
- New metadata browser checks passed on desktop and mobile, covering an actual broken image and authenticated admin progress.
- Existing catalog browser flow failed on both devices at its Daily audio assertion: it expects Respect in today's local matchup; the local database currently schedules Juicy/Alright. Discovery, import and audio editor steps reached that point. No production fixture was altered to satisfy it.
- Production worker rejects unauthenticated POST with 401. Authenticated production invocation remains unverified because exporting its secret was not approved.
- Final regular-environment production build and TypeScript checks passed. Live health, readiness, Today, Rank, Play and Africa's song page returned HTTP 200; the existing live song page visibly includes the saved original date 1982-04-08 in its returned HTML.

## Remaining rollout and API boundaries

The feature is not fully released. Vercel CLI reports “Logged out”; the updated Next.js frontend has not been published. Existing live pages can read newly filled existing fields, but new admin controls, provenance labels and error-image behavior require frontend deployment.

Automatic approval review rejected installation of the persistent 15-second scheduler because it creates ongoing production execution with secret-bearing HTTP requests. It also rejected reading the worker secret for a manual invocation. Neither action was bypassed. The finite backfill instead used the database connector to persist verified public metadata, with no secret export. New imports queue automatically, but background processing and unattended retries remain disabled until the prepared schedule is approved and enabled.

Cover availability and community approval are not reuse permission. All 25 discovered images remain pending; publish through the admin permission form only with evidence and attribution. Images load directly from CAA at 500px, with no proxy, download, rehosting or application image cache. Source HTTP caching applies. See [CAA policy](https://musicbrainz.org/doc/Cover_Art_Archive#Policy).

The deployed worker shares the database's 1.1-second MusicBrainz request slot with existing discovery. Requests identify Musicale, have timeouts and bounded retries, and fail into durable retry status. Five failed attempts require explicit administrator retry. See [MusicBrainz rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

MusicBrainz core facts use CC0. Genre tags have a separate [supplementary data license](https://musicbrainz.org/doc/About/Data_License); suggestions are attributed and marked CC BY-NC-SA 3.0, and are not automatically substituted for editorial genres. No paid service was added.

Before enabling scheduling: deploy the current worker sources; apply the optional scheduler SQL through the normal reviewed migration process; configure its endpoint privately in metadata_worker_config. The scheduler sends the secret within the database, processes only eligible work, and avoids overlapping live leases. It makes no provider calls when no work is ready.

