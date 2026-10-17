# Phase 5B — Higher-rated Play

October 17 integration note: operations now occupies the reserved `0011` slot on local main, and the complete combined chain passes through `0016`. The numbering discussion below records this phase’s original parallel-branch state. See [current integration and verification](INTEGRATION.md); applied hosted history must still be inspected before rollout.

October 16, 2026. Branch `phase-5b-higher-rated-game`, starting from Phase 5A `2e2c512`. Phase 5B is complete locally and in clean-checkout CI. Production was not changed. [Draft PR #11](https://github.com/yoonalexander/musicale/pull/11) is stacked on Phase 5A.

## Delivered behavior

`/play` asks which song has the higher community Elo. Signed-in players begin at zero. A correct guess earns one point and randomly replaces either card, independently of the selected/higher song. The replacement excludes both previous songs. A wrong guess ends the run; a new run begins at zero. Profile shows the latest run and its saved score separately from Daily participation and Rank history.

Each round captures both ratings in one database statement. The answer remains fixed while other people vote. Only graded answers reveal those snapshots. A retained song gets a fresh snapshot in the next round. Refreshing or returning to the page resumes the outstanding round without issuing a new pair or consuming a request. Pending rounds cannot be restarted to reroll them.

Eligibility requires an active song with usable listening, at least one actual accepted Daily or Rank preference, and an untied opponent. Initial ratings/counters alone do not qualify. Thirty-minute expiry, unavailable listening and missing replacements preserve earned points. Resume refreshes expired/unavailable rounds using the same two songs. If those songs are now tied or unavailable, the run pauses. After a correct guess with no replacement, resuming preserves the recorded replacement slot and retained song; it never silently swaps both. A player may explicitly end a paused run and start over. The page offers Rank when more preference evidence is needed.

The existing listening component, artwork credits, catalog, email authentication and styling are reused. Play and Rank share the song-card frame. Home, navigation, Help, Privacy and Profile distinguish Play points, Rank preferences and Daily streaks. The `/today` URL remains available under the Daily navigation label. Preview deployments show the read-only catalog and disable saved runs.

## Database and privacy

Migration `0013_play.sql` adds private `play_runs` and `play_rounds`, safe owner-only `start_play`, `submit_play_guess` and `get_play_state` RPCs, and an independent thirty-attempt Play budget per account per UTC minute. Failed business requests retain their attempt. Read-only state requests consume no budget.

RLS is enabled and all direct public/anon/authenticated table privileges are revoked, including owner reads: raw round rows contain the answer. The read RPC projects pending IDs/expiry only, and reveals snapshots only for that owner's graded answers. Neither Play table joins public Realtime; `public.songs` remains the only publication table. Browser-supplied scores and answers are ignored. Other accounts cannot consume or reveal a round.

Run ownership locks and per-account advisory locks make scoring, answer recording and next-round creation atomic. Same-choice retries return the original answer/score. Opposite choices cannot overwrite an answer. A late next-round failure rolls back the answer, score and advancement together. The guess acceptance timestamp is captured before writes so a slow accepted request does not become an expiry failure halfway through its transaction. Song-table locks precede private run/round locks to coordinate with ranking recovery.

Play writes no preference votes, rating events, Elo/counters, Daily activity, streaks or rating snapshots. It invalidates only Play/Profile views. Public ratings remain available elsewhere: this is a casual game, with no claim that players cannot look up an answer, guest mode or competitive score leaderboard.

## Verification

- `tests/play-database.mjs`: populated migration preservation; private projections/grants/publication; stable concurrent starts; both replacement slots; correct/wrong scoring; duplicate/opposite races; restart replay; expiry; unavailable audio; actual preference eligibility/ties; insufficient replacements/resumption; late rollback; durable independent budgets; exact ranking/Daily isolation; changed live rating order; recovery locks; and overlapping Play/Rank/Daily requests across expiry.
- `tests/browser/play.spec.ts`: real local email sign-in; no issuance on GET; pending controls; hidden current snapshots; refresh; point progression; exactly one changed card; keyboard answer/reveal focus; wrong/restart; Profile isolation; responsive widths 320/390/768/1024/1280; axe WCAG checks; server-action retries; forged score; anonymous/other-account denial; expiry/unavailable pause and resume.

| Check | Result |
| --- | --- |
| Local unit suite | 26 passed |
| Local database suite | 78 passed: 65 existing + 13 Play |
| Targeted desktop Play browser checks | 2 passed |
| Local production build and TypeScript | Passed |
| Dependency audit | 0 vulnerabilities |
| Full Windows browser suite | 63 passed: desktop Chromium, WebKit and mobile Chromium |
| Clean-checkout CI | [Run 36](https://github.com/yoonalexander/musicale/actions/runs/38951051562) passed on implementation commit `6559d10519cdf1dfa082e2a4d60ee4c5b11b8b69` |

CI also passed all **26 unit, 78 database and 84 browser cases**, the production build, TypeScript and dependency audit (zero vulnerabilities). Its four browser projects include Firefox on Linux. Windows uses three projects by default; the full local verify command exited successfully. The CI timeout was increased to thirty minutes for the expanded suite. These are functional/concurrency checks, not a claim about production capacity.

The completion commit adds only documentation, roadmap status and screenshots; the runtime, tests and configuration remain the exact code verified in run 36.

Recorded automated local screenshots: [desktop correct answer](evidence/phase-5b/desktop-correct.png), [desktop pause](evidence/phase-5b/desktop-paused.png), [mobile correct answer](evidence/phase-5b/mobile-correct.png), and [mobile pause](evidence/phase-5b/mobile-paused.png). These use synthetic local activity and were visually inspected. They do not replace physical-device or hosted acceptance.

All synthetic accounts/preferences and temporary failure fixtures are confined to disposable local databases or the isolated browser backend. No hosted data was changed.

## Rollout and remaining release work

Apply `0013` before deploying this application's Play/Profile code. First reconcile the inherited migration order: catalog `0010`, the parallel operations migration reserved for `0011`, Rank `0012`, then Play `0013`. The operations branch's duplicate **unapplied** `0010` must become `0011` when integrated; never rename applied hosted history or reset production. Existing songs, IDs, provider links, votes, Elo, history and accounts are preserved by the additive Play migration.

Hosted rollout and real-account acceptance remain unverified. Resolve the Phase 2 hosted sign-in issue in its original chat, then test the three modes in the target environment. Phase 6 must include private Play run/round data in backup/restore coverage and monitor its request budget. Phase 7 must repeat release acceptance for all three modes. Initial pair selection enumerates untied pairs for the modest catalog; replace it with indexed sampling before growing to a large library. Existing human product acceptance gates remain open.
