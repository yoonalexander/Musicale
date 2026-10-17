# Local main integration — October 17, 2026

The owner requested all existing work on local `main`, including phases with outstanding hosted acceptance. This integration does not push, deploy, enable monitoring, change hosted templates, or claim release readiness.

## Inventory and preservation

Seven worktrees and fourteen original local branches were reviewed. Every worktree was clean: no staged edits, tracked modifications or untracked nonignored files. There were no detached worktrees, stashes or unreachable commits. Ignored build output, diagnostics, private temporary data and local databases were left in place. No worktree or original branch was deleted or rewritten.

Before integration, `main` and `origin/main` were `042a178`. Local recovery branch `integration-backup-main-20261017` retains that commit. A private ignored Git bundle of all original refs and inventory records is under `tmp/integration-20261017/` in the integration checkout.

| Branch | Original tip | Integration |
| --- | --- | --- |
| `codex/phase-1-baseline` | `4cba07b` | Ancestor of audio stack |
| `phase-2-public-daily-loop` | `ab343e6` | Separate confirmation-flow merge |
| `phase-3-database-integrity` | `6bc6dd7` | Ancestor of audio stack |
| `phase-4-live-rankings` | `db78716` | Ancestor of audio stack |
| `phase-5-product-experience` | `1790a0e` | Already merged into audio stack |
| `automated-music-catalog` | `6d45292` | Ancestor of audio stack |
| `three-mode-product-roadmap` | `e5bd921` | Ancestor of audio stack |
| `phase-5a-continuous-ranking` | `2e2c512` | Ancestor of audio stack |
| `phase-5b-higher-rated-game` | `825679d` | Ancestor of audio stack |
| `game-first-guest-play` | `20277a5` | Ancestor of audio stack |
| `audio-preview-player` | `a8bc15d` | Fast-forwarded onto main first |
| `phase-6-operations` | `296588b` | Included through Phase 7 merge |
| `phase-7-release-evidence` | `505039d` | Separate operations/release merge |

The integration checkout is `C:\Users\alexy\.codex\worktrees\5b8b\musicale`. The original project directory remains on its Phase 2 branch; use the integration checkout to work on local `main`.

## Combined behavior and conflict decisions

- Preserved guest welcome/tutorial, repeatable Play scoring and private snapshots, continuous Rank preferences, Daily voting/streaks, shared Elo and mixed-mode recovery, live leaderboard, catalog automation, all manual administration, and the actual authorized 15-second audio player.
- Combined the separate email confirmation fix with guest account upgrades. The shared browser sign-in helper now handles both token-hash confirmation and existing guest verification links, using the selected local backend's email catcher rather than hard-coded ports. Retained preview-consumption, legacy PKCE, invalid/used-link and guest history regressions.
- Combined Admin readiness with catalog source/audio data instead of selecting either side's query result. Kept all unit, database, browser and restore commands in the verification script.
- Resolved README/roadmap overlaps by retaining the newer three-mode/guest/audio product direction and the operations/release evidence. Dated earlier screenshots and CI results remain historical evidence; current validation is recorded below.
- Renamed the operations branch's **unapplied** `0010_product_readiness.sql` to its pre-reserved `0011_product_readiness.sql`, without changing its contents. Catalog keeps `0010`. Existing migrations remain unchanged. Added forward migration `0016_integrated_audio_readiness.sql` so readiness uses the same eligibility predicate as Rank/Daily and counts explicitly authorized audio-only songs. Added a regression that rejects unavailable/rejected previews.
- Extended the private logical restore rehearsal to preserve and compare `musicale_legacy` tables and authorization metadata as well as public/Auth/migration data. Existing managed roles and source databases are preserved.

Canonical migration order is now `0001`–`0016`, with no duplicate version or reserved gap. No production database was inspected or changed by this task. An older operations-only local database may track its original operations migration as `0010`; inspect and reconcile that history explicitly before adopting this chain. Never reset production or relabel an applied hosted migration without a reviewed forward plan.

## Verification

Validation runs in a new disposable `musicale-integration` Supabase project under ignored `tmp/integration-local`, using API 61321, database 61322 and email catcher 61324. Existing projects, including the manual audio demo on 59321 and the Phase 6 backend on 57321, are untouched.

Initial checks: all sixteen migrations applied successfully, unit checks and TypeScript passed, the production build passed, and `npm audit` reported zero vulnerabilities. Full database/browser/restore results are being collected before the final evidence commit.

Logs stay under ignored `tmp/integration-20261017/`; raw email tokens, private dumps and account identifiers are excluded from committed evidence.

## Remaining release boundaries

All work is integrated for further local development, including incomplete hosted phases. Production sign-in/templates and real-device acceptance, owner administration, hosted migrations/Realtime/readiness, real alert receipt, encrypted off-site backup and the genuine seven-day beta remain open. Mainstream preview rights remain unavailable for the original twenty songs; four attributed open-license recordings provide the implemented player experience. See [Phase 2](PHASE_2.md), [Phase 6](PHASE_6.md), [Phase 7](PHASE_7.md), and [audio coverage](AUDIO_PREVIEWS.md).
