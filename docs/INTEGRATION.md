# Local main integration — October 17, 2026

The owner requested all existing work on local `main`, including phases with outstanding hosted acceptance. This integration does not push, deploy, enable monitoring, change hosted templates, or claim release readiness.

## Inventory and preservation

Seven worktrees and fourteen original local branches were reviewed. Every worktree was clean: no staged edits, tracked modifications or untracked nonignored files. There were no detached worktrees, stashes or unreachable commits. Ignored build output, diagnostics, private temporary data and local databases were left in place. No worktree or original branch was deleted or rewritten.

Before integration, `main` and `origin/main` were `042a178`. Local recovery branch `integration-backup-main-20261017` retains that commit. A private ignored Git bundle of all original refs and inventory records is under `tmp/integration-20261017/` in the integration checkout.

| Branch                        | Original tip | Integration                       |
| ----------------------------- | ------------ | --------------------------------- |
| `codex/phase-1-baseline`      | `4cba07b`    | Ancestor of audio stack           |
| `phase-2-public-daily-loop`   | `ab343e6`    | Separate confirmation-flow merge  |
| `phase-3-database-integrity`  | `6bc6dd7`    | Ancestor of audio stack           |
| `phase-4-live-rankings`       | `db78716`    | Ancestor of audio stack           |
| `phase-5-product-experience`  | `1790a0e`    | Already merged into audio stack   |
| `automated-music-catalog`     | `6d45292`    | Ancestor of audio stack           |
| `three-mode-product-roadmap`  | `e5bd921`    | Ancestor of audio stack           |
| `phase-5a-continuous-ranking` | `2e2c512`    | Ancestor of audio stack           |
| `phase-5b-higher-rated-game`  | `825679d`    | Ancestor of audio stack           |
| `game-first-guest-play`       | `20277a5`    | Ancestor of audio stack           |
| `audio-preview-player`        | `a8bc15d`    | Fast-forwarded onto main first    |
| `phase-6-operations`          | `296588b`    | Included through Phase 7 merge    |
| `phase-7-release-evidence`    | `505039d`    | Separate operations/release merge |

The integration checkout is `C:\Users\alexy\.codex\worktrees\5b8b\musicale`. At this integration's completion, the original project directory still used Phase 2. The subsequent YouTube correction brings current main into `codex/youtube-playback` in `C:\Users\alexy\Projects\musicale`; see [current YouTube integration evidence](YOUTUBE_PLAYBACK.md). The original directory now includes the newer frontend and all three modes.

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

Validated application source: integration merge `451b139`. The final evidence commit changes documentation only. Verification stages were run individually against the isolated project, rather than rerunning the same checks through the monolithic command.

| Check                           | Result                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh CLI migration chain       | All sixteen versions applied successfully                                                                                                         |
| Unit cases                      | 35 passed, including monitor and catalog/audio cases                                                                                              |
| Database cases                  | 93 passed: concurrency, rollback, mixed-mode recovery, fresh/legacy/incremental upgrades, catalog, Play, Rank, audio and readiness                |
| Full Playwright suite           | 93 passed in 26.7 minutes across desktop Chromium, Windows WebKit and mobile Chromium                                                             |
| Focused Firefox regressions     | 7 passed in 2.6 minutes using Linux Firefox via loopback-only Playwright; native Windows launch is blocked before application execution           |
| Production build and TypeScript | Passed                                                                                                                                            |
| Dependency audit                | Zero vulnerabilities                                                                                                                              |
| Local security advisors         | No ERROR findings; inherited `public.set_updated_at` mutable-search-path WARN remains                                                             |
| Private logical restore         | Passed: 53 tables, row/schema/authorization equality, restored identity isolation, duplicate protection, songs-only Realtime and unchanged source |

The restore snapshot included 126 Rank votes, 18 Play runs and 36 Play rounds. These are automated local fixture records, not production participation. Legacy tables were empty in this fresh backend, but their schema/grants were included; separate migration tests preserve nonempty legacy fixtures.

Native Firefox 155/Playwright 1.63 on this Windows host fails even when invoking `firefox.exe --version`: Windows reports an incorrect side-by-side configuration. The first focused run had six launch failures before reaching Musicale and one passing API-only readiness case. This is kept distinct from application failures; the cached Linux browser runtime completed all seven focused regressions without installing Windows system components. Total successful Playwright cases: **100** (93 full-suite cases plus seven focused Firefox cases). The Firefox subset covers real music controls/integration, both email paths, guest upgrades/existing-account history and readiness. It is not a full 31-case Firefox rerun.

Every original local branch tip was confirmed as an ancestor of main. A read-only remote-head inventory matched the original fourteen branches, including remote main at `042a178`. The original Git bundle verified successfully.

The temporary Linux browser service and integration backend were stopped after verification, preserving local data volumes and private evidence. Other projects/backends were not stopped. The earlier manual audio demo web server was stopped to free port 3100 for these tests; its backend/data are preserved.

Logs stay under ignored `tmp/integration-20261017/`; raw email tokens, private dumps and account identifiers are excluded from committed evidence.

## Remaining release boundaries

All work is integrated for further local development, including incomplete hosted phases. Production sign-in/templates and real-device acceptance, owner administration, hosted migrations/Realtime/readiness, real alert receipt, encrypted off-site backup and the genuine seven-day beta remain open. Mainstream preview rights remain unavailable for the original twenty songs; four attributed open-license recordings provide the implemented player experience. See [Phase 2](PHASE_2.md), [Phase 6](PHASE_6.md), [Phase 7](PHASE_7.md), and [audio coverage](AUDIO_PREVIEWS.md).
