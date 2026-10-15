# Phase 3 — Database integrity, authorization and recovery

Started October 15, 2026 on `phase-3-database-integrity`, from `phase-2-public-daily-loop` at `96ab7d7d1d46a911ee66b7007cd056b53ac74598`. The managed worktree is separate from the original chat's checkout. Phase 2 hosted sign-in remains unresolved in [its own record](PHASE_2.md).

Status: implementation and full local verification complete; clean-checkout CI pending. No production changes were made during this phase.

## Changes

- Forward migration `0008_transactional_boundaries.sql` moves profile/catalog/scheduling/recovery request budgets into their public RPCs. Their private processors cannot be called by API roles. Failed RPC business writes roll back in a subtransaction while their request attempt commits. Server actions inspect returned `error` objects and no longer reserve a second time.
- Direct authenticated editorial table writes also enforce the administrator budget, once per affected row. RPC batches reserve once as their definer and do not double-count those rows. A rejected direct table transaction rolls back its budget changes with the transaction; this path limits committed row changes and does not promise a durable count of rejected table requests. Trusted maintenance roles are outside the consumer API budget.
- Recovery checks each event against the original vote's before/after ratings, choice, recorded expectation, historical K-factor and delta. It also checks matchup pairing and daily activity identity/day. Missing or inconsistent sources stop the rebuild before any derived writes. The existing lock order and additive reconstruction remain in place.
- The database now rejects cancelling a started/voted matchup, matching the existing Admin restriction. Browser rollover fixtures use temporary local song unavailability instead of bypassing that rule.
- Tests reuse one local SQL harness; new suites cover integrity, recovery and migrations. The harness only creates/drops its own named disposable databases in a local Musicale container. A separate `musicale-phase3` backend on ports 56321–56324 supports browser tests without upgrading the original chat's local application database.

## Evidence mapped to the roadmap

| Task                   | Evidence                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Vote invariants    | Literal equal-rating example (+12/−12); vote/event/activity correspondence; per-account totals and first-day streaks; per-song wins/losses/counts; matchup totals and current snapshots.                                                                                         |
| 3.2 Concurrency        | Opposite simultaneous choices for one account produce one success and one preserved vote; fifty distinct accounts alternate choices, all are accepted, and the catalog rating sum is conserved.                                                                                  |
| 3.3 Rollback           | A disposable trigger fails after snapshot writes, after the vote/rating/profile/activity work. Complete business-state snapshots remain equal while the request count increments.                                                                                                |
| 3.4 Authorization      | Anonymous, owning ordinary account, another ordinary account and administrator SQL roles exercise table privileges, RLS, public RPCs and private-processor denial. Browser coverage replays a real Admin POST anonymously and after removing the account's admin role.           |
| 3.5 Budgets            | Valid, invalid and duplicate votes; shared admin RPC limits; profile edits and failed edits; separate accounts; prior-minute fixture; direct editorial API writes; no double reservation in the server action.                                                                   |
| 3.6 Catalog/scheduling | Metadata imports preserve ratings; invalid provider/date/duration/duplicate entries roll back complete batches; occupied dates remain intact; invalid pair batches and started-day replacements/cancellations preserve the original state.                                       |
| 3.7 Migrations         | Fresh installation, legacy upgrade, incremental upgrades from 0003 and 0007, private tracking, immutable historical-file hashes and seed idempotence. Identity, roles, join dates, old game/quota data, daily votes and audit/activity records are preserved.                    |
| 3.8 Recovery           | Three UTC days and three opponents use recorded K-factors 24, 32 and 16 while the current setting is 100. Deliberately corrupt ratings, counts and snapshots; compare the exact restored numeric projections. Votes, events, identities, profiles and activity remain unchanged. |
| 3.9 Recovery safety    | Missing events, mismatched before/after values, wrong historical K and inconsistent activity refuse recovery atomically. Repeated rebuilds preserve projections. Observed PostgreSQL lock waits prove recovery/vote overlap in both directions.                                  |
| 3.10 Visibility        | Anonymous/nonvoting viewers get null daily side counts, total and selection. A voter sees their saved result; direct daily-table reads remain restricted. Completed archive/song history excludes today; cumulative catalog statistics remain public.                            |

The three-day recovery fixture has independently specified changes: Respect beats God Only Knows at equal ratings (+12); Dreams beats Respect at K=32 (+17); God Only Knows beats Dreams at K=16 (+9). Final ratings are **1495, 1497 and 1508**, conserving 4500. Recovery uses the recorded historical changes, not the current K-factor.

The fifty-account measurement includes local Docker/psql process overhead. Earlier runs accepted 50/50 with zero errors in approximately 4.7–6.0 seconds. It is a reproducible small concurrency workload, not an internet-scale capacity benchmark.

## Verification

- Before the fixes, targeted regressions reproduced unrestricted sixth profile edits, 31st admin RPC requests, editorial table writes after budget exhaustion, inconsistent audit acceptance and cancellation of an already active voted day.
- Full `npm run verify` passed against the independent `musicale-phase3` backend: **18 unit checks; 22 existing + 14 integrity + 4 recovery + 5 migration cases = 45 database cases; production build; 21 browser cases on Chromium desktop/mobile and WebKit; TypeScript**. The final migration notification and browser assertion synchronization are also checked before the CI submission.
- Clean-checkout CI, final formatting and audit evidence will be recorded before closing the phase.

The disposable migration fixtures mirror the documented SQL-and-tracking setup with a minimal local `auth.users`/`auth.uid()` boundary. Fresh CLI startup of the separate backend also applied 0001–0008 and seeded through the real local Supabase runtime. SQL-role tests do not represent independent hosted JWT/login verification; Playwright exercises real local email/session/server-action behavior.

## Reproduction with an independent local backend

Normal development still uses `npm run local:start` and ports 55321–55324. To keep another worktree's backend intact, run this from the Phase 3 worktree in PowerShell:

```powershell
New-Item -ItemType Directory -Force tmp/phase3-local/supabase | Out-Null
Copy-Item supabase/migrations tmp/phase3-local/supabase -Recurse -Force
Copy-Item supabase/seed.sql tmp/phase3-local/supabase/seed.sql -Force
$phase3Config = (Get-Content supabase/config.toml -Raw).Replace('project_id = "musicale"', 'project_id = "musicale-phase3"').Replace('553', '563')
Set-Content tmp/phase3-local/supabase/config.toml $phase3Config
$env:MUSICALE_LOCAL_WORKDIR = 'tmp/phase3-local'
npx supabase start --workdir $env:MUSICALE_LOCAL_WORKDIR
npm run verify
npx supabase stop --workdir $env:MUSICALE_LOCAL_WORKDIR
Remove-Item Env:MUSICALE_LOCAL_WORKDIR
```

This only changes the ignored local config copy. It does not reset either application's database. Test-created disposable databases are removed after their suites. The optional workdir points status/container/mailbox discovery at the isolated project; application configuration still refuses hosted test URLs.

## Release requirements and limits

- Migration 0008 also sends the [PostgREST schema reload notification](https://docs.postgrest.org/en/stable/references/schema_cache.html#schema-cache-reloading-with-notify) after its RPC contract changes. Apply migration **0008 before deploying the matching application changes**, through a reviewed ordered migration rollout. This phase does not apply it to production. RPC success numbers remain JSON numbers; failures now return `{ "error": "…" }`, which callers must check. Profile/catalog success returns null. Avoid an extended interval with an older app that also reserves budgets.
- Phase 2's hosted authentication failure, owner bootstrap, production editorial buffer and hosted persistence checks remain open. Local Phase 3 evidence does not close those gates.
- Ranking recovery trusts retained votes/events, checks their internal agreement and restores ranking projections. It does not recover missing source data, authenticate the source against an external backup, rebuild user profile/history data, or replace the Phase 6 backup/restore rehearsal.
- Daily result fields are withheld at the RPC/UI boundary until voting. Public cumulative Elo, wins/losses, comparison counts and rating snapshots can support inference; this product does not promise absolute secrecy of daily outcomes.
