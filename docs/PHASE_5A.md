# Phase 5A — Continuous preference ranking

October 16, 2026. Branch: `phase-5a-continuous-ranking`. Started from the approved three-mode roadmap at `e5bd921`; integrated the completed Phase 5 consumer work at `1790a0e` through integration commit `5047f29`. Production and the Phase 2 hosted sign-in issue are unchanged. Play remains Phase 5B.

Status: implementation complete; final regression and clean-checkout CI evidence pending.

## Product behavior

`/rank` asks which song the signed-in listener prefers. It hides ratings on the choice cards, reuses existing artwork attribution, authorized audio and official listening links, and replaces **both** songs after an accepted choice. Both previous songs are excluded from the next pair. Rank updates the same song Elo, records and public live leaderboard as Daily.

An explicit **Get a pair** action starts the loop. GET requests, navigation prefetch and reload only read the outstanding pair; they cannot issue or reroll one. One pending comparison per account survives refresh. A pair expires after **30 minutes**. The same unordered pair has a **10-minute cooldown** after a vote. Issuing a new pair requires **at least four playable songs**. Exhaustion pauses honestly while preserving the accepted vote. There is no daily Rank quota; the independent Rank budget allows **30 attempts per account per UTC minute**, counting starts, retries and failed submissions.

Profile shows paginated **Rank preferences** separately from **Daily votes**. Rank never changes Daily activity, totals or UTC streaks, and does not consume the Daily request allowance. Keyboard controls, shared pending state, saved-choice feedback, expiry/unavailability recovery and empty histories are covered in the browser suite. Ratings remain public elsewhere; hiding them on Rank cards does not make them secret.

## Database and recovery

Forward migration `0012_continuous_rank.sql` adds private issued comparisons and Rank votes. Authenticated accounts may read their own rows; administrators retain read access; neither can directly insert, update or delete these tables. Anonymous access and public Realtime publication are denied. Only `public.songs` remains published. The authenticated RPCs validate ownership, pair membership, expiry and listening availability again at submission.

The vote transaction records the preference, equal-and-opposite Elo changes, counters, historical K-factor, event, snapshot, consumed comparison and next pair together. A late failure rolls back all these writes while retaining the request attempt. Replaying the same choice returns its original result without advancing twice; the opposite choice is rejected. A lost RPC acknowledgment is reconciled against the account's saved preference before showing success; an unconfirmed result directs the listener to Profile history.

Daily and Rank acquire song locks in sorted ID order using `FOR NO KEY UPDATE`: ratings do not change song IDs. Stronger row locks caused a real concurrent next-pair foreign-key deadlock during development; the burst regression covers its correction. Recovery and Rank acquire table locks in compatible order before row locks. Recovery waits for accepted writes, and voting waits for recovery.

Each rating event references exactly one Daily or Rank vote and receives a unique sequence order after song locks. Sequence gaps are harmless. Legacy events are ordered from their recorded before/after states, since transaction start timestamps may disagree with lock order. An inconsistent legacy chain aborts the migration with no partial schema or history changes. Existing source fields, song IDs, catalog metadata, provider associations, votes, profiles and snapshots are preserved.

If the state-based legacy reconstruction cannot complete, the migration stops for operator review; it does not rewrite evidence or guess missing values. Ambiguous histories may need additional review on a restored backup.

Replay validates both sources, historical formulas/K-factors, Daily participation and the complete causal rating chain **before** changing derived state. It restores mixed-mode Elo, wins/losses/counts and per-song/day snapshots in event order, while recomputing Daily matchup totals from Daily votes only. Missing events or inconsistent source records abort recovery atomically. Repeated recovery produces the same derived values without rewriting source records.

## Migration integration and rollout

The catalog branch owns `0010_catalog_discovery.sql`. The parallel operations branch also allocated `0010_product_readiness.sql`; it is **not included here**. Version **0011 is reserved** for that operations migration when the branches are combined, and Rank uses **0012** to avoid allocating another collision. Before combining or deploying those branches, rename the **unapplied** operations migration to `0011_product_readiness.sql` and test the combined migration sequence. Never rename a migration already applied to a hosted database: inspect its tracked history and plan a forward repair instead.

This branch's fresh ordered sequence is `0001`–`0010`, then `0012`; a numerical gap does not require a placeholder migration. Apply Rank's migration before deploying code that reads its tables/RPCs. Take and rehearse a backup in an isolated database first; do not reset hosted data. The operations backup/restore tooling must be extended and verified with the new private tables and sequence when integrated. Ranking replay does not replace backups of votes, accounts or issued comparisons.

## Verification

Named transaction checks: [tests/rank-database.mjs](../tests/rank-database.mjs). Browser coverage: [tests/browser/rank.spec.ts](../tests/browser/rank.spec.ts). Existing Daily, catalog, authorization, migration, recovery and live-ranking suites remain part of `npm run verify`.

Final commands, counts, immutable commit and CI link will be recorded after verification. Failed development runs are not acceptance evidence. Test history fixtures and synthetic audio remain local; no fabricated activity is published.

For an isolated local backend on this Windows machine:

```powershell
npm ci
New-Item -ItemType Directory -Force tmp/rank-local/supabase | Out-Null
Copy-Item supabase/migrations tmp/rank-local/supabase -Recurse -Force
Copy-Item supabase/seed.sql tmp/rank-local/supabase/seed.sql -Force
$rankConfig = (Get-Content supabase/config.toml -Raw).Replace('project_id = "musicale"', 'project_id = "musicale-rank"').Replace('553', '583')
Set-Content tmp/rank-local/supabase/config.toml $rankConfig
$env:MUSICALE_LOCAL_WORKDIR = 'tmp/rank-local'
npx supabase start --workdir $env:MUSICALE_LOCAL_WORKDIR
npm run verify
npm audit
npx supabase stop --workdir $env:MUSICALE_LOCAL_WORKDIR
Remove-Item Env:MUSICALE_LOCAL_WORKDIR
```

Own ports: API **58321**, PostgreSQL **58322**, mail catcher **58324**, test app **3100**. Helpers reject hosted backends. Linux CI includes Chromium, Firefox, WebKit and mobile Chromium; Windows omits Firefox by default. Do not reset or stop another worktree's services.

## Limits and remaining release work

Hosted deployment, hosted auth and hosted two-browser verification remain separate release work. Phase 5 human acceptance and Phase 5B's guessing game remain open. No new provider integrations, game points, guest voting, infinite unique-song guarantee or separate Rank leaderboard were added.

Pair selection enumerates the eligible catalog's pairs. This is appropriate for the current twenty-song library; indexed sampling and a fresh capacity review are needed before a large catalog. The burst is a local consistency workload, not a claim about production capacity or latency. Legacy order backfill is also intended for this small project history; measure it on a production-sized backup before rollout. Authorization of a listening source does not guarantee playback in every region.
