# Production deployment

**October 17 publication:** integrated `main` is now deployed to [musicale.alexyoon.com](https://musicale.alexyoon.com), with migrations through `0016`, guest authentication, four authorized audio sources, updated confirmation templates and a thirty-day Daily buffer. Play still needs genuine preference ratings; owner administration and hosted human acceptance remain open. See [the current rollout evidence](PRODUCTION_2026_10_17.md). Older dated sections below are historical records.

October 17 local integration: the current candidate combines all branches. Canonical migrations are `0001`–`0016`: catalog `0010`, operations `0011` (renamed from its unapplied parallel `0010`), Rank `0012`, Play `0013`, audio `0014`–`0015`, and audio-aware readiness `0016`. Apply only unapplied versions after inspecting the target history and taking a private backup. A local operations-only database tracking the older `0010_product_readiness` needs an explicit forward reconciliation; never silently rename applied history. No hosted changes or push occurred during integration. See [integration evidence](INTEGRATION.md).

Initial production setup: October 1, 2026. Preview environment scopes rechecked and changed October 15, 2026 through the signed-in Chrome dashboard. Database/authentication observations below remain the October 1 record unless explicitly dated otherwise.

## Phase 6 prepared rollout

Migration `0011_product_readiness.sql` and `/api/readiness` are prepared locally. Apply only unapplied migrations in the canonical chain above before the compatible application deployment. The monitor is disabled until its private configuration, actual staging failure notification and release approval are recorded. No new production backup or deployment was made. [Operations](OPERATIONS.md), [capacity](CAPACITY.md) and [Phase 6 evidence](PHASE_6.md) distinguish prepared steps from hosted facts. The following Phase 2/initial observations are historical, not a fresh production inspection.

## Phase 4 prepared rollout

October 16 audio update: apply unapplied `0014_audio_preview_player.sql` and `0015_authorized_daily_audio.sql` after the inherited migration chain, then deploy the corresponding code and `public/audio/` assets. Import the reviewed four-recording pack through Audio administration. No hosted change has been performed. The original twenty commercial tracks retain external links. See [preview setup, permission evidence and acceptance](AUDIO_PREVIEWS.md).

Phase 4 adds local Realtime and migration `0009_live_rankings.sql`, scoped to public songs only. No hosted changes were made. Apply unapplied 0008 and 0009 before their corresponding app deployment, verify the publication/Realtime connection, and repeat the two-browser hosted smoke check in [PHASE_4.md](PHASE_4.md#hosted-rollout-still-required). The Phase 2 hosted sign-in blocker remains open; the historical production observations below have not been refreshed by Phase 4.

## Catalog automation prepared rollout

The catalog addition builds on Phase 4 and adds `0010_catalog_discovery.sql`. Apply all unapplied migrations in order through 0010 before deploying its code. It introduces empty source/audio tables, protects editorial fields during discovery refreshes and corrects historical listening analytics without changing voting history or rankings. New discoveries remain unavailable until reviewed. No iTunes previews or artwork are automatically authorized, and no hosted change was made. See [catalog automation and verification](CATALOG_AUTOMATION.md).

## Continuous Rank prepared rollout — October 16

Phase 5A adds `0012_continuous_rank.sql` after the catalog migration. No hosted changes were made. Apply the migration before its application code, and verify private issued-comparison/vote RLS, mixed-mode replay, independent Daily participation and two-browser live delivery in the target environment. Operations now occupies the previously reserved version 0011. Do not rewrite applied history or reset hosted data. See [Phase 5A evidence, migration order and limits](PHASE_5A.md). The hosted sign-in blocker remains open.

## October 16 game-first guest update

`game-first-guest-play` adds guest entry and a focused welcome/tutorial flow without a schema migration. Hosted rollout requires enabling anonymous sign-ins and manual identity linking, and allowlisting the exact `/api/auth/guest-confirm` redirect before deploying the new UI. Public abuse prevention and guest retention/backup policies require environment acceptance. Do not delete anonymous users with preference history; account deletion cascades into ranking recovery sources. No production settings were changed. See [the guest experience and validation](GUEST_EXPERIENCE.md). The existing Phase 2 magic-link callback and hosted issue remain separate.

## October 16 Phase 5B update

Play is implemented on `phase-5b-higher-rated-game` with additive migration `0013_play.sql`. Apply it before deploying the new Play/Profile code, after catalog `0010` and Rank `0012`; operations now occupies `0011`. Do not rewrite applied history or reset hosted data. Direct reads of Play tables are denied even to owners, and only graded own answers are exposed by the state RPC. Public Realtime remains songs only. No production changes were made for this phase. See [Phase 5B evidence and remaining hosted acceptance](PHASE_5B.md).

## October 15 Phase 2 update

- Rechecked production before changes: migrations `0001`–`0006`, twenty songs and providers, zero users and votes, no matchup today and no next-thirty-day queue.
- Applied and tracked migration `0007` after saving the exact previous function definition locally and checking the starting state. A separate read-only check confirmed the 60-character rule and unchanged song/user/vote counts. No production data reset was performed.
- Resend sending domain `auth.musicale.alexyoon.com` is verified. With owner approval, added its DKIM TXT and two sending CNAME records in Namecheap. Existing website DNS and the root mail policy were preserved.
- Auth Site URL and exact callback remain correct. Supabase SMTP was prepared with sender `signin@auth.musicale.alexyoon.com`, sender name `Musicale`, host `smtp.resend.com`, TLS port `465` and username `resend`. The owner reports entering the credential directly and saving. The connected non-team inbox confirms actual email delivery; direct inspection of the persisted masked settings remains unavailable.
- Hosted sign-in is blocked: a fresh link requested and opened in Chrome still reaches the generic callback error. The emailed verification endpoint and exact callback are correct; local sign-in passes. The specific production auth error must be inspected before claiming a cause or fix. See the investigation in [PHASE_2.md](PHASE_2.md).
- Restored October 15's UTC matchup, Respect versus God Only Knows, through a conflict-preserving trusted setup insert. The database row and live Today page confirm Musicale #12; both official provider links resolved. This bootstrap has no app administrator actor yet. The next 30 production days still need scheduling after owner account setup; today's restored pair expires at `2026-10-16T00:00:00Z`.
- Phase 2 application changes passed [clean-checkout CI](https://github.com/yoonalexander/musicale/actions/runs/38814328618) and remain on draft PR #2, stacked on Phase 1. Production still runs `main`; neither application branch has been promoted.

Current Phase 2 evidence and remaining hosted checks are in [PHASE_2.md](PHASE_2.md). The sections below preserve the original deployment record.

## October 16 sign-in diagnosis

Read-only Supabase logs show the retry link verified by a Safari-style request before Chrome received an already-used-token error; no successful application session was created. A local test reproduces premature link consumption. Phase 2 now prepares an explicit confirmation page and token-hash POST verification for new emails. It has not been deployed, and production email templates have not changed. Follow [the required app-before-template rollout order](PHASE_2.md#required-rollout-order), including both signup and magic-link templates and the real hosted acceptance checks. Later phase branches must retain their changes when incorporating this fix.

## Services and domain

- Canonical site: https://musicale.alexyoon.com
- Vercel: `yoonalexanders-projects/musicale`, Hobby plan, GitHub `yoonalexander/musicale`, production branch `main`.
- Supabase: `musicale` in `AlexYoon`, Free plan, project reference `geqddmynokawzojkteko`, region `us-east-1`.
- Supabase URL: https://geqddmynokawzojkteko.supabase.co
- Namecheap CNAME: host `musicale`, target `8498f7b1a8a3bcb5.vercel-dns-017.com.`, automatic TTL. Vercel reports Valid Configuration and the site serves HTTPS.

On October 15, both Supabase variables were found attached to Production and Preview. Their scopes were changed and saved to **Production only**; `NEXT_PUBLIC_SITE_URL` remains in both environments. System environment variables are enabled, so the build guard can check `VERCEL_ENV`. New previews use the read-only starter catalog with a visible notice, disabled sign-in and disabled persistent voting. The build rejects either Supabase variable in Preview. Use local Supabase for authenticated testing; cloud staging is deferred. Environment changes apply to new deployments, not existing builds. The Preview deployment filter showed no retained previews on October 15. No credential value was rotated and no production database change was made.

## Database and authentication

The new database was inspected first and had no public tables or migration history. Migrations `0001`–`0006` were applied in order through the SQL editor, followed by the seed. Their versions, names and original statements were recorded in `supabase_migrations.schema_migrations`. That schema is private, its tracking table has RLS, and public/anon/authenticated access is revoked. Do not reapply the bootstrap or reset hosted data.

Verified: six tracked migrations, twenty songs, twenty official provider links and today's UTC matchup. The ten curated starter pairs were scheduled for October 2–11 with conflict preservation; eleven matchups now cover October 1–11. The queue must be replenished through Admin before it runs out.

Supabase Auth Site URL is `https://musicale.alexyoon.com`. Its allowed redirect is exactly `https://musicale.alexyoon.com/api/auth/callback`. Email authentication and confirmation remain enabled; anonymous sign-ins remain disabled.

Custom SMTP is **not configured**. Supabase's default mail service only accepts project-team recipients and is limited to two messages per hour; it is unsuitable for public sign-in. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp). Choose an email provider, verify its sending domain, and configure its SMTP credentials directly in Supabase. Do not add SMTP credentials to frontend environment variables or Git.

No production administrator has been assigned. After the owner's first successful app sign-in, identify that exact account and grant only it the admin role using a trusted SQL session.

## Verification and remaining work

The production deployment is Ready and `/api/health` returns `{"status":"ready"}`. Live Chrome checks verified the daily matchup, the twenty-song leaderboard and the enabled sign-in form, with preview mode removed. A read-only database check confirmed RLS on every public table and on migration tracking. Local tests verify magic links, voting, results, persistence, profiles, authorization and admin tools against an isolated backend.

Hosted email delivery, a real authenticated vote, persistence after reload, streak changes and owner administration remain unverified until SMTP and an owner app account are available. No synthetic accounts or votes were created in production.

Keep the editorial queue supplied, expand the catalog as desired, and use `/api/health` for a hosting monitor. No separate Render server is required by this Next.js/Supabase architecture. No paid plan or add-on was enabled during this setup.
