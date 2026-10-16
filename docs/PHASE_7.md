# Phase 7 — Release validation and résumé evidence

Started October 16, 2026 on `phase-7-release-evidence`, from Phase 6 commit `30db9adbb91b3373c5db6d061cb34184904e7291`, in a separate managed worktree.

Status: **release artifacts and candidate CI complete; hosted/human acceptance pending; not released**. The candidate implements the promised product and reliability workflows locally. Human acceptance, hosted setup and seven actual UTC days remain required; they cannot be marked complete while the owner is asleep or replaced with fixtures. Release acceptance gates are unmet; no release tag or production deployment was made.

## Candidate and deliverables

- Product/backend code is frozen at Phase 6 commit `30db9ad`; this phase adds documentation and four reviewed screenshots only. The branch/PR records the complete candidate commit and its clean-checkout run when finished.
- [CLAIM_EVIDENCE.md](CLAIM_EVIDENCE.md) maps every supplied résumé variant to implementation, named automated tests, CI and the remaining hosted boundary. It distinguishes database tests in Node/PostgreSQL from browser tests in Playwright, event reconstruction from source-data restore, and local timing from hosted behavior.
- [DEMO.md](DEMO.md) gives a reproducible local interview walkthrough and architecture diagram. [BETA.md](BETA.md) gives the real-user/elapsed-day acceptance record without inventing participants or dates.
- Screenshots: [Home desktop](screenshots/home-desktop.png), [Today mobile](screenshots/today-mobile.png), [live leaderboard mobile](screenshots/leaderboard-mobile.png), [song detail desktop](screenshots/song-desktop.png). Captured October 16 from the isolated local candidate, signed out. They contain automated local participation, not production popularity. Header sign-in and absence of profile/Admin/owner identity were checked before capture; each image was visually inspected. The leaderboard was recaptured after its subscription connected.
- The prepared local candidate is running at `http://127.0.0.1:3200`, with local inbox `http://127.0.0.1:57324`. A fictional `phase7-owner@example.test` is prepared only in the guarded isolated `musicale-phase6` backend for the human editorial test. No production administrator identity or credential is published.

## Current automated evidence

- [Phase 5 CI](https://github.com/yoonalexander/musicale/actions/runs/38875051774) passed **22 unit checks, 45 database cases, production build, 64 Chromium/Firefox/WebKit/mobile browser cases, TypeScript and audit** on `b4dfa7e`.
- Phase 6 local verification passed **29 unit checks, 52 database cases, production build, 51 Windows Chromium/WebKit/mobile browser cases, TypeScript, zero audit vulnerabilities and a real private logical restore**. The restore compares all 41 selected tables, owners/grants/RLS/constraints/functions/triggers/views/sequences, retained Auth rows and migration history, restored identity isolation and duplicate-vote rejection. [Phase 6 CI](https://github.com/yoonalexander/musicale/actions/runs/38878641061) passed the complete **29 unit/52 database/68 browser** Linux matrix, build, TypeScript, audit and real backup/restore on `30db9ad`. Its fifty-account burst accepted 50/50, zero errors, in 2,278 ms.
- Phase 7's isolated production build passed, and public screenshot pages were checked in a fresh anonymous browser. This prose/screenshot-only change does not alter database/application behavior. [Exact candidate clean-checkout CI](https://github.com/yoonalexander/musicale/actions/runs/38881020854) passed on `d08a77fcf587eb822d3753d0edc8a26848cb786f`: **29 unit checks, 52 database cases, production build, 68 Chromium/Firefox/WebKit/mobile browser cases, actual private logical restore, TypeScript and zero audit vulnerabilities**. [Draft PR #8](https://github.com/yoonalexander/musicale/pull/8) is stacked on Phase 6. The follow-up documentation commit records this completed result; product code remains unchanged.

## Read-only public observation

At `2026-10-16T09:15:02Z`, direct anonymous HTTPS requests returned:

| Route            | Result                                                              | Meaning                                                               |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/`              | HTTP 200                                                            | Public page is reachable; not full product acceptance.                |
| `/today`         | HTTP 200, “Today’s matchup is being tuned.” / “Check back shortly.” | Public daily product is unavailable despite successful HTTP delivery. |
| `/api/health`    | HTTP 200, `status: ready`                                           | Database connectivity alone is ready.                                 |
| `/api/readiness` | HTTP 404                                                            | Phase 6's readiness route is not deployed.                            |

The web extraction service could not fetch these URLs; a separate direct HTTPS read succeeded. This was not an outage verdict from the extraction failure. No sign-in link, vote, owner mutation or database write was performed. The current deployed commit and exact hosted migration versions could not be re-inspected because dashboard access failed; the last confirmed production schema remains the October 15 Phase 2 record, through 0007. Hosted sign-in's last reported fresh same-browser failure remains unverified here and belongs to the original Phase 2 investigation.

## Release blockers

| Blocker                                                                    | Required evidence                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public daily loop unavailable; hosted sign-in not successfully reverified  | Resolve Phase 2 in its original chat, establish real owner and ordinary account, populate the queue and record legitimate vote/reload/history/streak behavior.                             |
| Phase 5 human acceptance outstanding                                       | New visitor without developer guidance, actual owner editorial session, screen-reader/keyboard/device results.                                                                             |
| Hosted operations incomplete                                               | Current plan/config inspection, private production export and encrypted off-site destination, isolated restore/auth/grant rehearsal, safe staging failure with actual owner alert receipt. |
| Candidate not deployed/verified in isolated hosted staging then production | Reviewed ordered migrations, exact application commit, real hosted email/vote/live-ranking/owner smoke and thirty playable future days.                                                    |
| Seven-day/three-person beta not started                                    | Complete BETA.md using real participants and seven consecutive UTC calendar days after the daily product works.                                                                            |

These are required acceptance conditions, not minor cosmetic backlog. The roadmap's Phase 5/6/7 final gates remain open. The local code/evidence can be committed and pushed for review while the release is withheld. No paid upgrade, new hosted service account, private backup upload or production change was made. Supabase CLI management access is also unavailable; no credential was printed or changed during that read-only check.

## Final release record — intentionally unfilled

- Release tag/commit: pending all required gates.
- Hosted deployment UTC date and exact migration versions: pending.
- Beta first/last UTC dates and participant outcomes: pending.
- Owner alert receipt and private backup/restore record: pending.
- Remaining minor issues: no cosmetic issue is used to excuse the blockers above.

When the blockers are resolved, freeze the accepted candidate, rerun the complete clean-checkout gate, link exact hosted results and beta dates, and only then publish the release/tag. Do not call this prepared candidate a completed public release before those facts exist.
