# Phase 6 — Sustainable operations

Started October 16, 2026 on `phase-6-operations`, from Phase 5 implementation `b4dfa7e` and its evidence commit `1790a0e`, in a separate managed worktree.

Status: **operations implementation and local automated verification complete; CI, hosted activation and human acceptance pending**. No production schema, account, email setting, deployment or monitor has been changed. Phase 2's hosted sign-in defect remains in its original investigation. Authenticated dashboard access failed at the browser runtime twice, including after reset, so it cannot establish current account settings or a hosted delivery receipt.

## Implemented

- Migration `0010_product_readiness.sql` adds one stable, fixed-search-path, security-definer aggregate RPC. Anonymous and authenticated callers receive only UTC day, today's playability, consecutive playable future days and the valid-day count in a thirty-day horizon. It does not reveal future song choices or private participation. Existing tables, grants and historical migrations remain intact.
- `/api/health` remains database connectivity. `/api/readiness` separately returns 200 only when today is playable and the consecutive future buffer is at least fourteen days. Attention, unavailable and preview states return 503 with no-store headers. A cancelled/missing day breaks the buffer; later dates do not hide the gap. A missing active song/provider makes affected dates unplayable.
- Admin displays this server-authoritative playable buffer alongside its existing schedule count and variety report.
- The Resend monitor checks both endpoints, validates their contract, reports missing/low-buffer/database/connectivity failures, and refuses to claim delivery after a failed provider request. It never logs keys or recipient addresses. The hourly GitHub workflow is **disabled until explicitly enabled with configuration**; no active hosted monitoring is claimed.
- [OPERATIONS.md](OPERATIONS.md) assigns the editorial routine and documents missing/unavailable content, sign-in, ranking inconsistency, backup/restore, migration failure, deployment rollback and staged cutover. [CAPACITY.md](CAPACITY.md) records dated provider references, planning assumptions and measured local limits without scale/uptime promises.
- The local restore script exports application, Auth, migration and extension schemas privately, restores only a uniquely owned disposable database with existing local managed roles, compares all selected rows and schema/authorization metadata, verifies restored identity isolation and duplicate-vote rejection, reconciles songs-only Realtime, and confirms the source remained unchanged.

## Evidence

- **29 unit checks**: 22 existing product/validation cases plus seven monitor cases. Monitor tests cover healthy silence, missing today, 13/14-day boundary, database/connectivity failures, malformed data, rejected delivery and unsafe monitor origins.
- **52 database cases**: 45 existing integrity/recovery/migration cases plus seven new readiness cases. Fresh/legacy/incremental migrations pass; normalized historical hashes now include migration 0009. Current distinct-account burst: **50 accepted of 50, zero errors, 6,349 ms** in the local Windows environment. This is not a hosted throughput claim.
- Production build, **51 browser cases across Chromium desktop/mobile and WebKit**, TypeScript, full dependency audit (zero vulnerabilities), source formatting and patch whitespace checks pass. Linux/Firefox clean-checkout CI is pending.
- The initial successful logical restore at `2026-10-16T08:57:40Z` compared **41 tables**, including one real local email-authenticated identity/user, one saved vote/rating event and ten migration records. All selected rows, RLS, grants, constraints, functions, owners and account isolation matched. The stronger rehearsal at `2026-10-16T09:00:03Z` also passed trigger, view and sequence comparisons. The ordinary local `postgres` role initially could not preserve managed Auth owners; the final local restore uses existing `supabase_admin` privileges in the disposable target. Only the target's empty default public schema is removed. The intentionally different database name is excluded from grant comparison; no permission is excluded.

Private logical dumps and schema manifests stay under ignored `tmp/restore-*`; no backup, credential, personal account identity or raw dump is committed or published. The aggregate local report is not a hosted restore receipt. Existing managed roles are reused, so this rehearsal does not prove role-password migration or new-project platform configuration.

## Reproduce

Use the separate local project and ports, with Docker Desktop's Linux engine:

```powershell
npm ci
New-Item -ItemType Directory -Force tmp/phase6-local/supabase | Out-Null
Copy-Item supabase/migrations tmp/phase6-local/supabase -Recurse -Force
Copy-Item supabase/seed.sql tmp/phase6-local/supabase/seed.sql -Force
$phase6Config = (Get-Content supabase/config.toml -Raw).Replace('project_id = "musicale"', 'project_id = "musicale-phase6"').Replace('553', '573')
Set-Content tmp/phase6-local/supabase/config.toml $phase6Config
$env:MUSICALE_LOCAL_WORKDIR='tmp/phase6-local'
npx supabase start --workdir $env:MUSICALE_LOCAL_WORKDIR
npm run verify
npm audit
npx supabase stop --workdir $env:MUSICALE_LOCAL_WORKDIR
```

API 57321, database 57322, email catcher 57324 and browser app 3200 must be free. The Phase 5 stack was stopped with its volumes preserved before reusing those ports; the original and other projects' backends were not stopped. Verification runs real local browser voting before the restore script, which requires source vote/Auth records. All restore targets are disposable; no hosted URL is accepted.

## Remaining hosted/human gates

1. Resolve the separate Phase 2 sign-in blocker and identify the real app administrator. Complete Phase 5's new-visitor, owner and screen-reader checks.
2. Inspect the actual hosting plans/configuration, privately export a production backup using the documented supported procedure, preserve/reconcile Auth and grants, and place encrypted copies at an owner-approved off-site destination. No destination or dated production export has been verified yet.
3. Deploy migration 0010 and the readiness route to isolated hosted staging after the preceding migrations. Configure a restricted sending key and private owner alert destination. Trigger a safe staging failure and record actual receipt and resolution. Unit provider mocks and local logs are not this receipt.
4. After staged acceptance and approval of the concrete rollout, deploy the compatible stack, establish thirty playable future days, and enable the scheduled monitor. Current production queue coverage has not been refreshed by this phase.

The local implementation can be reviewed and committed while these dependencies remain open. Phase 6's operational acceptance gate is not complete until the hosted receipt, private backup destination/export and real owner operation are recorded.
