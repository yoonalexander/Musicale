# Phase 5A — Continuous preference ranking

October 16, 2026. Branch: `phase-5a-continuous-ranking`. Started from the approved three-mode roadmap at `e5bd921`; integrated the completed Phase 5 consumer work at `1790a0e` through integration commit `5047f29`. Production and the Phase 2 hosted sign-in issue are unchanged. Play remains Phase 5B.

Status: **Phase 5A complete locally and in clean-checkout CI**. Hosted rollout and Phase 2 sign-in remain separate release work.

## Product behavior

`/rank` asks which song the signed-in listener prefers. It hides ratings on the choice cards, reuses existing artwork attribution, authorized audio and official listening links, and replaces **both** songs after an accepted choice. Both previous songs are excluded from the next pair. Rank updates the same song Elo, records and public live leaderboard as Daily.

An explicit **Get a pair** action starts the loop. GET requests, navigation prefetch and reload only read the outstanding pair; they cannot issue or reroll one. One pending comparison per account survives refresh. A pair expires after **30 minutes**. The same unordered pair has a **10-minute cooldown** after a vote. Issuing a new pair requires **at least four playable songs**. Exhaustion pauses honestly while preserving the accepted vote. There is no daily Rank quota; the independent Rank budget allows **30 attempts per account per UTC minute**, counting starts, retries and failed submissions.

Profile shows paginated **Rank preferences** separately from **Daily votes**. Rank never changes Daily activity, totals or UTC streaks, and does not consume the Daily request allowance. Keyboard controls, shared pending state, saved-choice feedback, expiry/unavailability recovery and empty histories are covered in the browser suite. Ratings remain public elsewhere; hiding them on Rank cards does not make them secret.

## Database and recovery

Forward migration `0012_continuous_rank.sql` adds private issued comparisons and Rank votes. Authenticated accounts may read their own rows; administrators retain read access; neither can directly insert, update or delete these tables. Anonymous access and public Realtime publication are denied. Only `public.songs` remains published. The authenticated RPCs validate ownership, pair membership, expiry and listening availability again at submission.

The vote transaction records the preference, equal-and-opposite Elo changes, counters, historical K-factor, event, snapshot, consumed comparison and next pair together. A late failure rolls back all these writes while retaining the request attempt. Replaying the same choice returns its original result without advancing twice; the opposite choice is rejected. A lost RPC acknowledgment is reconciled against the account's saved preference before showing success; an unconfirmed result directs the listener to Profile history.

Acceptance time is captured at the locked expiry check, so a vote accepted before its deadline stays valid even if its writes finish later. A delayed-write fixture crosses that boundary and then successfully replays the saved history.

Daily and Rank acquire song locks in sorted ID order using `FOR NO KEY UPDATE`: ratings do not change song IDs. Stronger row locks caused a real concurrent next-pair foreign-key deadlock during development; the burst regression covers its correction. Recovery and Rank acquire table locks in compatible order before row locks. Recovery waits for accepted writes, and voting waits for recovery.

Each rating event references exactly one Daily or Rank vote and receives a unique sequence order after song locks. Sequence gaps are harmless. Legacy events are ordered from their recorded before/after states, since transaction start timestamps may disagree with lock order. An inconsistent legacy chain aborts the migration with no partial schema or history changes. Existing source fields, song IDs, catalog metadata, provider associations, votes, profiles and snapshots are preserved.

If the state-based legacy reconstruction cannot complete, the migration stops for operator review; it does not rewrite evidence or guess missing values. Ambiguous histories may need additional review on a restored backup.

Replay validates both sources, historical formulas/K-factors, Daily participation and the complete causal rating chain **before** changing derived state. It restores mixed-mode Elo, wins/losses/counts and per-song/day snapshots in event order, while recomputing Daily matchup totals from Daily votes only. Missing events or inconsistent source records abort recovery atomically. Repeated recovery produces the same derived values without rewriting source records.

## Migration integration and rollout

The catalog branch owns `0010_catalog_discovery.sql`. The parallel operations branch also allocated `0010_product_readiness.sql`; it is **not included here**. Version **0011 is reserved** for that operations migration when the branches are combined, and Rank uses **0012** to avoid allocating another collision. Before combining or deploying those branches, rename the **unapplied** operations migration to `0011_product_readiness.sql` and test the combined migration sequence. Never rename a migration already applied to a hosted database: inspect its tracked history and plan a forward repair instead.

This branch's fresh ordered sequence is `0001`–`0010`, then `0012`; a numerical gap does not require a placeholder migration. Apply Rank's migration before deploying code that reads its tables/RPCs. Take and rehearse a backup in an isolated database first; do not reset hosted data. The operations backup/restore tooling must be extended and verified with the new private tables and sequence when integrated. Ranking replay does not replace backups of votes, accounts or issued comparisons.

## Verification

Named transaction checks: [tests/rank-database.mjs](../tests/rank-database.mjs). Browser coverage: [tests/browser/rank.spec.ts](../tests/browser/rank.spec.ts). Existing Daily, catalog, authorization, migration, recovery and live-ranking suites remain part of `npm run verify`.

Local verification covers **26 unit checks, 65 database cases** (52 existing plus 13 Rank cases), production build, TypeScript, formatting, patch whitespace and a dependency audit with **zero vulnerabilities**. The final Rank burst accepted **50/50** preferences with zero errors in **4,939 ms**, including Docker CLI overhead. This is a correctness workload, not an API latency benchmark.

The full Windows browser matrix initially passed **54/57**. Its failures were two old assumptions that BTS would stay unrated after random Rank votes, and a genuine early audio-error race on Windows WebKit. Dedicated metadata-only fixtures now test unrated presentation. The shared listening component checks errors already present before hydration and reports failure once. A new regression holds page scripts, forces a real native source error, then verifies the fallback, retained external link and failure analytics after hydration. All **six targeted catalog/onboarding cases** then passed across desktop Chromium, WebKit and mobile Chromium. These combined runs cover all Windows cases; they are **not a claim that the initial full Windows run was green**. All six Rank browser cases passed in that full run, with live refresh observations of **927 ms desktop, 1,057 ms WebKit and 908 ms mobile**.

The existing admin-rebuild browser checks also caught Supabase REST's safe-update rule, which plain SQL sessions did not reproduce. Recovery retains explicit `WHERE` guards on bulk writes and now passes the full-stack rebuild checks. Failed development runs are not acceptance evidence. Test history fixtures and synthetic audio remain local; no fabricated activity is published.

[Clean-checkout CI run 34](https://github.com/yoonalexander/musicale/actions/runs/38945002263) passed on implementation commit **`ef1b11244c46f3073e3324a39879890dfbb41017`**: **26 unit checks, 65 database cases, production build, 76 browser cases across Chromium/Firefox/WebKit/mobile, TypeScript and zero audit vulnerabilities**. All eight Rank browser cases and all four catalog/audio cases passed. The CI Rank burst accepted **50/50** with zero errors in **1,817 ms**. Rank live refresh observations were **1,133 ms Chromium, 612 ms Firefox, 1,191 ms WebKit and 1,115 ms mobile**, below the five-second acceptance target in this isolated environment. These are observations, not production latency promises. CI also stopped its backend successfully. [Draft PR #10](https://github.com/yoonalexander/musicale/pull/10) is stacked on the three-mode roadmap; the completion-record commit changes documentation and screenshots only.

Retained screenshots use one synthetic local account: [first mobile pair](evidence/phase-5a/mobile-first-pair.png), [current pair after two preferences](evidence/phase-5a/mobile-next-pair.png), and [separate Rank history with zero Daily activity](evidence/phase-5a/profile-rank-history.png). They illustrate the UI; the transaction and browser assertions prove pair progression and isolation. Local traces and raw logs remain ignored because they may include test authentication state.

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
