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

MusicBrainz core metadata is CC0. Supplementary genre suggestions remain separately marked CC BY-NC-SA 3.0 and do not replace editorial genres. Commercial API usage needs its own terms review. [MusicBrainz data license](https://musicbrainz.org/doc/About/Data_License), [API terms](https://musicbrainz.org/doc/MusicBrainz_API).

## Coverage snapshot after controlled backfill

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

That initial CI run passed the unit and database suites and 224 browser cases, with four optional real-YouTube cases skipped. Twelve browser failures identified two fixes: keep `metadataDetails` out of the existing leaderboard API response contract, and use the correct partial label locator for the admin queue dropdown (its nested options contribute to the label text). Both failures reproduced before correction; the API fix also passes typecheck and the production build. A subsequent full CI run verifies the corrected runtime. Local `npm audit` reports zero vulnerabilities.

At 18:16 UTC, a clean production browser verified HTTP 200 for `/`, `/play`, `/rank`, `/today`, `/leaderboard`, `/songs/africa-toto`, `/api/health`, and `/api/readiness`. Africa's detail page displayed the original recording date and album edition separately. Its real native YouTube iframe reached `PLAYING` after the user-style load/play actions. Its unpermitted artwork remained a letter placeholder. `/admin` redirected the unauthenticated browser to sign-in. This smoke test submitted no votes or guesses; authenticated admin decisions and voting are exercised in the isolated regression environment.

Applied migration history must retain the hosted versions: `20261018080521`, `20261018081732`, `20261018174735`, `20261018175951`, and `20261018180409`. The latter three provide private dispatch, reviewed metadata/image permissions, and the verified daily schedule. No seed/reset is part of production rollout.
