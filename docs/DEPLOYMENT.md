# Production deployment

Initial production setup: October 1, 2026. Preview environment scopes rechecked and changed October 15, 2026 through the signed-in Chrome dashboard. Database/authentication observations below remain the October 1 record unless explicitly dated otherwise.

## October 15 Phase 2 update

- Rechecked production before changes: migrations `0001`–`0006`, twenty songs and providers, zero users and votes, no matchup today and no next-thirty-day queue.
- Applied and tracked migration `0007` after saving the exact previous function definition locally and checking the starting state. A separate read-only check confirmed the 60-character rule and unchanged song/user/vote counts. No production data reset was performed.
- Resend sending domain `auth.musicale.alexyoon.com` is verified. With owner approval, added its DKIM TXT and two sending CNAME records in Namecheap. Existing website DNS and the root mail policy were preserved.
- Auth Site URL and exact callback remain correct. Supabase SMTP has been prepared with sender `signin@auth.musicale.alexyoon.com`, sender name `Musicale`, host `smtp.resend.com`, TLS port `465` and username `resend`. The owner must create the domain-restricted sending credential, enter it directly in Supabase and save. Until that is verified, public email delivery remains unproven.
- Restored October 15's UTC matchup, Respect versus God Only Knows, through a conflict-preserving trusted setup insert. The database row and live Today page confirm Musicale #12; both official provider links resolved. This bootstrap has no app administrator actor yet. The next 30 production days still need scheduling after owner account setup; today's restored pair expires at `2026-10-16T00:00:00Z`.
- Phase 2 application changes passed [clean-checkout CI](https://github.com/yoonalexander/musicale/actions/runs/38814328618) and remain on draft PR #2, stacked on Phase 1. Production still runs `main`; neither application branch has been promoted.

Current Phase 2 evidence and remaining hosted checks are in [PHASE_2.md](PHASE_2.md). The sections below preserve the original deployment record.

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
