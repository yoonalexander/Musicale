# MusicBrainz metadata and album artwork

October 18, 2026 follow-up to the [initial backfill](METADATA_ENRICHMENT_2026_10_18.md).

## Production changes

The existing integration is retained. Song IDs, YouTube/provider associations, voting, Elo, and Daily scheduling are not rebuilt or recalculated.

- The production Edge Function was invoked through `pg_net`, with its private header read inside PostgreSQL. No secret was exported. HTTP responses 1 and 2 returned 200 and completed actual enrichment; the updated worker saved an immutable cover image ID for Africa without publishing it. Later finite batches processed the unresolved catalog.
- The worker processes up to ten eligible jobs, with a 40-second soft batch deadline. Per-request timeouts, shared 1.1-second MusicBrainz request slots, leased jobs and bounded retries remain in place. A cover-provider failure can no longer discard already verified recording metadata.
- After verification, the production cron job was enabled at **07:00 UTC daily** (`musicale-metadata-enrichment`). There is no production 15-second schedule. It makes no HTTP call when the queue is empty or another live lease is processing. A daily run is bounded; larger imports can be processed through the existing five-song admin batch.
- Search no longer requires the existing editorial year to be correct. Known albums narrow the first query; broader recording and album/artist fallbacks surface missing candidates. ISRCs and saved recording IDs are reused. Explicit remix/version labels are distinguished from originals; featured-credit punctuation is normalized. Translations, aliases, incomplete artist credits, date conflicts and competing recordings require review. The matcher does not invent transliterations or treat an evidence score as a probability.
- Manual recording associations remain pinned. Existing nonempty editorial fields are preserved by automatic enrichment. Album/year corrections require separate administrator selections and an optimistic check against the values displayed during review. Metadata saves lock song/job rows in the same order as editorial updates.
- The admin provides status/rights filters, artist/title search, candidate radio choices, recording/release evidence links, explicit identity confirmation, per-song refresh, and optional reviewed album/year correction. Expected review errors are returned to the browser rather than relying on production exception text.

## Artwork availability and permission

Cover Art Archive identifies available images; it does not grant blanket reuse rights. An `approved` front cover is community approval of the image association, not copyright permission. See [CAA policy](https://musicbrainz.org/doc/Cover_Art_Archive#Policy) and [API semantics](https://musicbrainz.org/doc/Cover_Art_Archive/API).

Discovery first checks the matched release, then the release-group cover if needed. It records the actual source release and pins a specific CAA image/thumbnail when available. A changing `/front` endpoint cannot be newly approved: the exact image must be identified first.

Publication requires an administrator to record the image-specific rights basis, evidence URL, scope of permission for Musicale, and required attribution/license. Supported bases are direct rights-holder permission, an image-specific open license, verified public domain or ownership. A MusicBrainz/CAA availability URL alone is explicitly rejected as rights evidence. This is a documented human review, not an automated legal determination. Evidence/reviewer identity remain in the private admin job table.

Administrators can leave permission pending or reject/withdraw it. Withdrawal clears only the image associated with that permission; unrelated manually supplied artwork is preserved. The older approval RPC is no longer executable by ordinary authenticated clients. The worker has no automatic artwork-approval path.

No commercial cover was automatically authorized, and no unverified cover was published. Existing letter placeholders remain. A practical compliant route is rights-holder permission or a demonstrable image-specific license; an audio recording's license does not automatically license its cover.

Provider alternatives were checked rather than assumed to solve permissions. [Apple's Search API terms](https://performance-partners.apple.com/search-api) restrict assets to store promotion with purchase badges and prohibit independent entertainment use; this is not a blanket license for Musicale's game cards. [Spotify's developer policy](https://developer.spotify.com/policy) prohibits games/trivia and imposes content/linking restrictions. Neither was added as an artwork workaround. No artist/label was contacted on the user's behalf.

A bounded [licensed-provider review](ARTWORK_PROVIDER_RESEARCH.md) identifies Music Story as a possible artwork-only supplier: its own offer lists licensed covers and its API supports MusicBrainz/ISRC identifiers. Default editorial terms do not establish game permission. A written, game-specific agreement and representative coverage test would be needed before integrating or publishing supplier assets. No quote, contract, trial or provider contact was made, and a supplier agreement would not automatically license the existing CAA copies.

MusicBrainz core metadata is CC0. Supplementary genre suggestions remain separately marked CC BY-NC-SA 3.0 and do not replace editorial genres. Commercial API usage needs its own terms review. [MusicBrainz data license](https://musicbrainz.org/doc/About/Data_License), [API terms](https://musicbrainz.org/doc/MusicBrainz_API).

## Coverage snapshot after controlled backfill

Confirmed against production at 23:12 UTC on October 18, 2026.

| Measure | Result |
| --- | ---: |
| Catalog songs | 64 |
| Saved MusicBrainz associations | 39 (previously 36) |
| Manual review | 21 (previously 19) |
| Unmatched | 4 (previously 9) |
| Retryable provider failures | 0 |
| Discovered cover images | 28 (previously 25) |
| Published/approved artwork permissions | 0 |
| Songs still without artwork | 64 |
| Empty/placeholder album names | 0 (previously 2) |

New automatic associations: Despacito, Dynamite and Hey Ya!. Previously unmatched translations/credits can now appear for review instead of disappearing. God Only Knows and Gymnopedie No. 3 initially encountered MusicBrainz 503 responses. After their normal backoff, production dispatches 5 and 6 both returned 200: the former now requires review and the latter is unmatched. No failed jobs remain. All four unmatched songs are the three open Gymnopedie recordings and In the Hall of the Mountain King; the matcher did not substitute another performance of the same composition. Coverage is not a claim that every accepted community-sourced date has been independently verified by a human.

Production checks retain ratings hash `94bc53512a03e8c67c2fd94feb5ac0a6`, provider hash `372d12954d8d7e094968ef0458b19bdc`, and Daily schedule hash `e25bea8fc7a58ed49b16275f4f3e800a`. No production votes/guesses were submitted or ranking data rewritten. No recording ID is associated with more than one catalog song.

## Validation and publication

The unit/API suite and production build/typecheck pass, including explicit remixes, featured artists, incorrect years, translation review, shared request slots and exact-image source handling. The new database/browser regressions cover permission decisions/withdrawal, manual-art preservation, candidate selection without copying IDs, and rejecting source-only rights claims.

Local Docker stopped responding during the follow-up: the local Supabase status call timed out and the disposable metadata database test could not finish. Docker and unrelated project containers were not restarted. Fresh database/browser regressions run in GitHub's isolated environment; earlier initial-pass suites are documented separately and are not a substitute for fresh follow-up results.

Runtime commit `6d804722c6c32d607fc2fc8f5aa7b7b8b7671d45` was pushed to `main` and [successfully deployed by Vercel](https://vercel.com/yoonalexanders-projects/musicale/7UZAjN8zFg7fZ8xy3UDGfysR3yzZ). The metadata frontend and admin review workflow are published at [Musicale](https://musicale.alexyoon.com). [Full regression CI](https://github.com/yoonalexander/musicale/actions/runs/39153209111) tests this runtime commit.

That initial CI run passed the unit and database suites and 224 browser cases, with four optional real-YouTube cases skipped. Twelve browser failures identified two fixes: keep `metadataDetails` out of the existing leaderboard API response contract, and use the correct partial label locator for the admin queue dropdown (its nested options contribute to the label text). Both failures reproduced before correction.

Corrected runtime commit `445c76ced1b5ab180740ec512d94e1964ec7b0e0` is [successfully deployed](https://vercel.com/yoonalexanders-projects/musicale/4fQhuNeJu5Pq2nWjREGALGhsVRiw). Its [complete CI run passed](https://github.com/yoonalexander/musicale/actions/runs/39155421813): unit/API tests, all database integration suites, production build, **236 browser cases passed across desktop Chromium, Firefox, WebKit and mobile Chromium**, logical backup/restore rehearsal, typecheck and `npm audit` with zero vulnerabilities. Four optional external real-YouTube browser cases were skipped in CI; a real production iframe reached `PLAYING` separately as described below. Both metadata admin cases passed in every browser project, including reviewed candidate selection and rejecting a CAA source-only rights claim. The deployed leaderboard response contract and song-page provenance were also rechecked after the fix.

At 18:16 UTC, a clean production browser verified HTTP 200 for `/`, `/play`, `/rank`, `/today`, `/leaderboard`, `/songs/africa-toto`, `/api/health`, and `/api/readiness`. Africa's detail page displayed the original recording date and album edition separately. Its real native YouTube iframe reached `PLAYING` after the user-style load/play actions. Its unpermitted artwork remained a letter placeholder. `/admin` redirected the unauthenticated browser to sign-in. This smoke test submitted no votes or guesses; authenticated admin decisions and voting are exercised in the isolated regression environment.

Remaining human work: 21 recording/release decisions, four unmatched performances, and all image-specific permissions. No supplier contract, quote or real-cover license was obtained. The existing production browser had no admin session, so owner acceptance of the published admin interface was not exercised there. The first automatic cron execution is due October 19 at 07:00 UTC; authenticated production dispatch, idle behavior and the active daily schedule were verified, but that future timed execution has not yet occurred.

Applied migration history must retain the hosted versions: `20261018080521`, `20261018081732`, `20261018174735`, `20261018175951`, and `20261018180409`. The latter three provide private dispatch, reviewed metadata/image permissions, and the verified daily schedule. No seed/reset is part of production rollout.

## Owner review recovery — October 18, 2026 (America/Toronto)

The owner's review pass saved 12 associations, bringing the total to 51, but nine attempted selections moved to Failed jobs. A live Blank Space reproduction confirmed that a valid selected 1989 edition was absent from the recording lookup's 25 linked releases, while its direct release track list contained the recording. The matcher now looks up an omitted selected edition directly and requires its track list to contain the requested recording. It retains the existing title/artist/release validation; an unrelated edition remains rejected. See the [MusicBrainz linked-entity limit](https://musicbrainz.org/doc/MusicBrainz_API#Subqueries).

Migration `20261019013733_metadata_review_candidates` returns the existing candidate list when a job is claimed. Validation failures now stay in review with their candidates; provider outages retain candidates in Failed jobs. [Runtime commit 1da5e69](https://github.com/yoonalexander/musicale/commit/1da5e6925941f036941cce0d81fc9fe5d2fea7f2) and [its frontend deployment](https://vercel.com/yoonalexanders-projects/musicale/2sik5FcNpbMo3A6GH1kwyap588Bo) are published; the production Edge Function is version 4.

Only the nine unresolved failed jobs were restored to review, guarded by their old error, unchanged title/artist and absence of a saved association. Eight candidate lists came from the earlier backup; Levitating was searched again. The failed saves had not retained the owner's selected IDs, so those nine require reselection rather than replaying an assumed choice. The 12 successful human reviews remain saved. Song metadata hash `fbd2b0a706cc79e50f2cda41d5c7043b`, ratings, providers and Daily scheduling stayed unchanged through recovery.

Recovery coverage: **51 enriched, nine needing review, four unmatched, zero failed jobs, 39 located covers, zero published covers**. Local verification passed the complete unit/API suite, metadata database regression, production build and six metadata admin browser cases across desktop Chromium, WebKit and mobile Chromium, including the omitted-edition path. Live edition validation passed for recovered candidates without accepting any associations. The deployed worker rejects unauthenticated requests, health/readiness and leaderboard return 200, and security-advisor findings are unchanged. The [broader GitHub regression run](https://github.com/yoonalexander/musicale/actions/runs/39186322542) was still running when this recovery was recorded.

## Artwork outage after review — October 18, 2026 (America/Toronto)

The owner completed all 21 manual reviews. Production now has 60 saved associations: 58 completed jobs and two artwork-only failures, with four unmatched songs and no remaining match-review jobs. Blank Space received a Cover Art Archive HTTP 500; Shake It Off timed out. Both selected recordings and their 1989 release edition were already saved with `reviewedByAdmin=true`. Neither requires another recording review. There are 46 located covers and zero published covers; no image-specific permission was granted.

The worker now returns an explicit saved-metadata result and a separate artwork warning. The review action completes requested, verified album/year corrections even when the cover lookup fails, and the admin displays that the recording match is saved. The durable artwork failure and existing retry/backoff remain in place; automatic retries retain the reviewed recording and edition. No ranking fields, permission rules, schedule or schema were changed.

Validation: complete unit/API suite (including 26 metadata/YouTube Node cases), metadata database preservation regression, production build/typecheck, and nine metadata admin browser cases passed across desktop Chromium, WebKit and mobile Chromium. The outage regression verifies both the saved association and a requested year correction, while keeping artwork unpublished. The previous broader regression run linked above has since completed successfully; the new runtime receives its own CI run on publication.
