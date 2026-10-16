# Phase 4 — Live rankings and coherent caching

Started October 15, 2026 (America/Toronto), on `phase-4-live-rankings` from Phase 3 commit `6bc6dd756a16763fb1ab0fd995a595718112e9ce`. Worktree: a separate managed `phase-4-live-rankings` checkout. Phase 2's hosted sign-in issue remains in [its own record](PHASE_2.md).

Status: **local implementation and acceptance complete October 15, 2026; clean-checkout CI pending**. Hosted rollout/smoke verification remains a release requirement. Production and the original worktree's local database are unchanged.

## Behavior and boundaries

- Migration `0009_live_rankings.sql` makes `supabase_realtime` an explicit publication of **public.songs only**. Existing public SELECT grants and song RLS remain intact. It does not publish votes, profiles, daily matchups, rating events, request budgets, activity or admin audit records. Song rows already contain public catalog/ranking fields, including availability; song identifiers are public catalog identifiers.
- Local Realtime is enabled in `supabase/config.toml`. Hosted environments receive the same publication through the ordered migration. Hosted Realtime reachability and the five-second target still require the release smoke check below.
- The open leaderboard subscribes to song inserts/updates/deletes. A 150 ms notification window combines paired song updates; an event arriving during a read queues another read. PostgreSQL remains the authority; the browser never applies Elo deltas.
- Server-rendered page loads retain the tagged **30-second public cache**. `GET /api/leaderboard` calls the same catalog query outside that cache; both its response and downstream database fetch are `no-store`. The query uses an anonymous, sessionless client and maps only public song fields. Cookies and private viewer state are never inputs to this cache or refresh response.
- One shared parser bounds filters, sort and pagination for initial and live reads. Live refresh keeps the URL, form and selected page. When availability changes remove the last row on a page, that page becomes empty with the correct total and a Previous link instead of throwing a range error.
- Votes, editor saves/imports, availability and recovery update songs and therefore notify other leaderboard browsers, including direct authorized RPCs. Normal app actions retain selective cache/route invalidation. Availability changes now also invalidate the song detail route. Scheduling, featured flags and K-factor edits do not change the present song ranking; their existing Today/Admin/Archive invalidations remain appropriate.
- Database subscription readiness, reconnect, return online and visible-tab transitions trigger authoritative reads. Failures keep the last usable rows and navigation, disclose possible staleness, and offer Refresh rankings. Navigation removes the channel, event listeners, pending timer and active request. There is no polling fallback or new service/dependency.

The publication's scope is intentional and replaces any earlier table list for `supabase_realtime`. Inspect unexpected existing publication members before a hosted rollout. Separate system-managed publications, including Realtime broadcast internals, are unaffected.

Public cumulative ratings and counters can still support inference about today's voting. This adds no public stream of matchup counts or viewer-authorized daily results and does not change the [documented visibility contract](PHASE_3.md#release-requirements-and-limits).

## Verification evidence

- Final local verification passed: **19 unit checks, 45 database cases, production build, 30 browser cases across Chromium desktop/mobile and WebKit, and TypeScript**. The full command completed its unit/database/build stages before a turn interruption; browser checks were resumed with `npx playwright test` against that build, followed by `npm run typecheck`. No unsuccessful/interrupted browser run is counted as passing.
- `npm audit`: **zero vulnerabilities**. Changed source/docs formatting and `git diff --check` pass.
- The final local fifty-account transaction regression accepted **50/50, zero errors, 6248 ms**, including local Docker/psql overhead. This remains a small repeatable workload, not a scale claim.
- Earlier regressions reproduced an expired local day after UTC midnight and the existing out-of-range leaderboard failure. Current-day idempotent fixtures and the range fallback address those cases; the final browser run also verifies a live page becomes empty at a nonzero catalog total.
- Actual measured live-update intervals in the final local browser run:

```text
LIVE LATENCY desktop: app=985ms RPC=1349ms
LIVE LATENCY webkit: app=1520ms RPC=1173ms
LIVE LATENCY mobile: app=971ms RPC=678ms
```

The direct-RPC test demonstrates that the ordinary server-rendered cache still contains the older result while the subscribed browser shows the committed current ranking. The publication/privacy, filtered pagination, controlled recovery, reconnection and cleanup cases all pass. Generated unedited recordings and screenshots remain in the local ignored output directory. CI, including Firefox, is pending and will be recorded after its run.

Focused Playwright cases in [live-rankings.spec.ts](../tests/browser/live-rankings.spec.ts):

1. Two independent contexts: an actual email-authenticated app vote updates an anonymous open leaderboard; another account's direct RPC vote updates it while a JavaScript-disabled browser still demonstrates the older warm cached result. Assert actual PostgreSQL WebSocket frames, bounded refresh count, public payload/response fields and latency under five seconds. The measured interval includes request/account preparation overhead, so it is a conservative local observation rather than a production timing guarantee.
2. Thirty-song import, edit, availability changes and ranking reconstruction update an open filtered/sorted second page. Check row order, total, page retention and last-page removal. Fixtures affect only generated never-voted local catalog entries; reconstruction restores the existing legitimate local vote events after a controlled derived-rating corruption.
3. Offline changes catch up on reconnect; failed reads preserve rows; visible-tab restoration catches a missed vote; three client navigations remove/recreate the actual database subscription without accumulation.

Migration fixtures verify only `public.songs` is published and anonymous SELECT/RLS remain enabled after supported incremental upgrades. Historical migrations 0001–0008 retain normalized immutable hashes. Existing database authorization/recovery and full browser flows remain regression coverage.

## Reproduce without touching another worktree

From this worktree in PowerShell, with Docker Desktop's Linux engine running:

```powershell
npm ci
New-Item -ItemType Directory -Force tmp/phase4-local/supabase | Out-Null
Copy-Item supabase/migrations tmp/phase4-local/supabase -Recurse -Force
Copy-Item supabase/seed.sql tmp/phase4-local/supabase/seed.sql -Force
$phase4Config = (Get-Content supabase/config.toml -Raw).Replace('project_id = "musicale"', 'project_id = "musicale-phase4"').Replace('553', '563')
Set-Content tmp/phase4-local/supabase/config.toml $phase4Config
$env:MUSICALE_LOCAL_WORKDIR = 'tmp/phase4-local'
npx supabase start --workdir $env:MUSICALE_LOCAL_WORKDIR
npm run verify
npx supabase stop --workdir $env:MUSICALE_LOCAL_WORKDIR
Remove-Item Env:MUSICALE_LOCAL_WORKDIR
```

The separate project uses API 56321, PostgreSQL 56322 and Mailpit 56324. Do not run it concurrently with another project already bound to these ports. Stopping preserves its data. Browser fixtures idempotently seed the current UTC day, including when reusing a stack across midnight; no hosted URL or reset is accepted.

Successful two-browser runs save an **unedited** video under ignored `output/live-demo/` and screenshots under `output/*-live-rankings.png`. Failed runs retain Playwright traces. These artifacts contain generated local accounts only and are not published to Git.

## Hosted rollout still required

No hosted setting, migration, account or vote was changed in this phase. Read-only previews keep credentials absent and create no subscription. Cloud staging remains deferred by the earlier environment decision.

Before deploying the matching app, inspect/backup the target and apply only unapplied ordered migrations, including **0008 then 0009**. Do not rewrite historical files or reset the target. Verify Supabase Realtime is running/reachable over WSS, and inspect:

```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime'; -- exactly public.songs
select relrowsecurity from pg_class where oid = 'public.songs'::regclass; -- true
select has_table_privilege('anon', 'public.songs', 'select'); -- true
```

After deploy, use an ordinary legitimate vote in browser A and keep browser B's leaderboard open: require Live rankings connected, an authoritative update within five seconds under normal conditions, retained filters/page, offline recovery and no private frames/responses. Record the deployed commit/migrations and timing in Phase 7. Phase 2 hosted sign-in must be fixed first. Local passing behavior does not establish hosted delivery, uptime, scale or an unqualified production real-time claim.

Implementation references: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Realtime readiness/troubleshooting](https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting), and [Next.js fetch caching](https://nextjs.org/docs/app/api-reference/functions/fetch).
