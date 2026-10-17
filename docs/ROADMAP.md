# Musicale completion roadmap

Created October 15, 2026. Based on the [project status review](PROJECT_STATUS.md), the current implementation and the supplied résumé descriptions.

Revised October 16: the owner approved Play and continuous Rank alongside Daily as a third mode. [The three-mode product contract](PRODUCT_MODES.md) defines the new scope. Rank is implemented and passed Phase 5A local/CI checks; hosted rollout remains pending. Play passed Phase 5B locally and in clean-checkout CI; hosted rollout remains pending. See [Phase 5A](PHASE_5A.md) and [Phase 5B evidence](PHASE_5B.md).

## Finish line

Ship a complete, maintained public music voting product that supports the behavior described across the résumés and has reproducible evidence behind its engineering claims.

“Done” means an ordinary visitor can use the deployed product, its database remains correct under concurrent and unauthorized requests, the owner can operate and recover it, and another developer can reproduce its tests. A feature is complete only after its acceptance checks pass. Existing code, previous test results and an enabled form are not substitutes for current verification.

All phase gates below, including the new 5A/5B gates, are required for this release. The proposed numerical targets are acceptance targets for this project, not claims about current traffic, uptime or capacity. Implementation progress and dated evidence are recorded per phase.

## Product contract

Musicale has three modes: Play asks which of two songs has the higher Elo rating and awards run points; Rank continuously collects preferences using two new songs after each vote; Daily retains one shared editorial matchup and one preference vote per account per UTC day. Daily and Rank update one Elo-ranked song catalog; Play never changes ratings. An administrator manages recordings, imports, availability and future Daily matchups. Listening uses authorized previews where available and official provider links as fallback.

The finished release includes:

- Daily matchups, results, profiles, paginated voting history and streaks.
- Continuous Rank pairs, atomic preference votes and identifiable Rank history, independent of Daily limits/streaks.
- Server-graded Play runs: one point per correct answer, random replacement of either card, and stable answers for issued rounds.
- Email authentication, database-enforced authorization, input constraints and durable rate limits.
- Atomic vote processing and catalog imports, with auditable changes.
- Live leaderboard updates across open browsers and selective cache invalidation.
- Ordered schema migrations, recovery from recorded rating events and a tested backup/restore procedure.
- Automated database and Playwright browser checks, passing CI and a working public deployment.
- A usable mobile/desktop interface, verified provider links and a sustainable editorial schedule.

### Precise meanings of the résumé claims

| Claim                           | Required meaning and proof                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One Daily vote per user per day | At most one successful Daily vote per authenticated account per UTC calendar day. Database constraints and transaction logic enforce this, including concurrent requests and direct RPC calls. Rank uses per-issued-comparison uniqueness and a repeat-pair cooldown. This does not claim one vote per human across multiple accounts.                 |
| Atomic transactions             | Daily writes its vote, both song records, matchup totals, participation, profile streak and rating event together. Rank writes its preference, both song records and rating event together, without changing Daily streaks/activity. A failed vote leaves business records unchanged; a rejected attempt may still consume its durable request budget. |
| Real-time ranking               | Another active browser receives a server-pushed change notification and displays authoritative updated rankings without manual reload. The normal-condition acceptance target is within five seconds of a committed vote. This is not a hard real-time timing guarantee.                                                                               |
| Replay-based recovery           | Reconstruct ratings, win/loss records, Daily matchup totals and snapshots from preserved Daily and Rank rating events/votes in deterministic update order, starting from the documented baseline. Preserve original events and historical K-factors. Play guesses are excluded. Do not rerun old votes with today's K-factor.                          |
| Selective cache invalidation    | Successful relevant mutations invalidate affected public ranking data and route views. Private user state is never shared through the public cache. Live refreshes cannot be masked by stale cached responses.                                                                                                                                         |
| Concurrency and reliability     | Automated tests demonstrate correctness for specified concurrent workloads, with measured results recorded. Do not imply unlimited scale or production traffic that has not occurred.                                                                                                                                                                  |

Phase 3 proves the recovery guarantees locally and in CI. Phase 4 now implements push-based live rankings and an uncached public refresh path; [its evidence](PHASE_4.md) distinguishes local acceptance from the still-required hosted rollout and demonstration.

[Phase 5A](PHASE_5A.md) extends transaction, recovery and live-ranking evidence to continuous Rank, with all gates passed locally and in clean-checkout CI. [Phase 5B](PHASE_5B.md) proves Play scoring, snapshot fairness and isolation locally and in clean-checkout CI. Hosted acceptance and the remaining release gates stay open.

An additional [catalog automation workstream](CATALOG_AUTOMATION.md) builds on Phase 4 with reviewed MusicBrainz discovery/imports, protected metadata refreshes and explicitly authorized previews. It does not complete or replace any remaining phase gate, and Phase 2's hosted sign-in issue remains separate.

## Phase order

| Phase | Outcome                                                                | Depends on                       | Initial state                                                                    |
| ----- | ---------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| 1     | Reproducible development, isolated testing and passing baseline checks | Nothing                          | Complete October 15; [verification evidence](PHASE_1.md)                         |
| 2     | Working public sign-in and daily voting loop                           | 1                                | Launch operations incomplete or unverified; Today was empty                      |
| 3     | Proven transaction, authorization, migration and recovery guarantees   | 1; use 2 for hosted smoke checks | Complete October 15; [local and CI evidence](PHASE_3.md)                         |
| 4     | Live rankings with consistent caching                                  | 3                                | Complete October 15; [local and CI evidence](PHASE_4.md); hosted rollout pending |
| 5     | Complete consumer and administrator experience                         | 2–4                              | Core screens exist; usability and content gaps remain                            |
| 5A    | Continuous Rank with shared Elo and mixed-mode recovery                | 3–5 and catalog integration      | Complete locally and in CI; [evidence](PHASE_5A.md); hosted rollout pending      |
| 5B    | Higher-rated Play game with server-graded run points                   | 5A                               | Complete locally and in CI; [evidence](PHASE_5B.md); hosted rollout pending      |
| 6     | Sustainable content, monitoring and recovery operations                | 2–5, 5A, 5B                      | Incomplete or unverified; extend coverage to all three modes                     |
| 7     | Release acceptance and résumé evidence                                 | 1–6                              | Not complete                                                                     |

Execute in this order by default. Safe local work in Phase 3 can continue while Phase 2 hosted sign-in remains unresolved. Build the specific tests alongside their phases; Phase 7 reruns and records the complete result.

## Phase 1 — Establish a reproducible, isolated baseline

**Outcome:** Changes can be developed and verified without touching production data.

### Tasks

- [x] **1.1 Inspect current environments.** Recheck production and preview settings rather than assuming the October 1 deployment notes are still current. Record configuration status without copying secrets into the repository.
- [x] **1.2 Isolate previews.** Remove production database access from preview deployments. Use read-only preview mode until an isolated staging Supabase project is available. Configure staging URLs and auth redirects together before staging mutations.
- [x] **1.3 Restore local verification.** Start Docker and the project-specific local Supabase stack. Confirm ports, local email catcher and the test scripts' protections against hosted databases.
- [x] **1.4 Fix the dependency advisory.** Update the affected compatible transitive dependency in the lockfile; rerun the audit. Recheck current advisories at implementation time rather than treating the review's advisory list as permanent.
- [x] **1.5 Align display-name limits.** Use 60 characters consistently in the form, server action and database RPC; add a forward migration for the RPC change. Keep applied historical migrations unchanged. Verify 60 succeeds and 61 fails clearly.
- [x] **1.6 Run the baseline.** Run the existing unit, database, production-build, browser and TypeScript checks. Resolve failures and verify the GitHub workflow on the same commit. Address the local workspace-root warning if it affects build tracing or reproducibility.

**Primary files:** [package.json](../package.json), [lockfile](../package-lock.json), [verification workflow](../.github/workflows/verify.yml), [Supabase configuration](../supabase/config.toml), [profile page](../app/profile/page.tsx), [actions](../app/actions.ts), [migrations](../supabase/migrations/), [deployment notes](DEPLOYMENT.md).

### Phase gate

- [x] A clean checkout can start the documented local backend and run `npm run verify` successfully.
- [x] `npm audit` passes the existing CI policy; any exception is explicitly documented and reviewed, never silently ignored.
- [x] CI passes on the tested commit, with failures retaining useful browser evidence.
- [x] Preview mutations cannot reach the production backend; read-only previews are visibly labeled.
- [x] The display-name boundary is covered by an actual database/application check.

**Evidence:** [Phase 1 record](PHASE_1.md), including the tested commit SHA, passing CI run, preview smoke check, command results and environment decisions.

## Phase 2 — Complete the public daily loop

**Outcome:** An ordinary non-team visitor can use the deployed product from sign-in through a saved vote.

### Tasks

- [x] **2.1 Complete public email delivery.** Verify or configure the email provider, sending domain and Supabase SMTP settings. Keep credentials in provider settings, not frontend variables or Git. Verify exact production callback URLs. Owner reports SMTP saved; actual non-team inbox delivery and the emailed callback are confirmed. Hosted sign-in still fails and is tracked separately in [the Phase 2 investigation](PHASE_2.md#october-15-hosted-sign-in-investigation).
- [ ] **2.2 Establish the owner account.** Sign in as the owner and assign that exact account the admin role through the trusted setup path. Verify an ordinary account remains unable to use admin actions.
- [ ] **2.3 Restore today's matchup.** Schedule an active pair with working provider links. Populate the next 30 UTC days using the existing scheduler; Phase 5 finishes the variety/content checks. October 15's production pair is restored and its links checked; the thirty-day queue shortcut is implemented/tested, with production scheduling pending owner setup.
- [ ] **2.4 Verify hosted persistence.** With an ordinary non-team account, sign in, listen, vote, reload, revisit Today, open Profile and confirm the saved choice and first-day streak.
- [x] **2.5 Finish authentication feedback.** Show a pending state, prevent accidental repeated submissions, and provide clear recovery for expired/used links, email delivery failure and session expiry. Preserve safe error messages.
- [x] **2.6 Finish unavailable states.** When Today has no valid pair, explain availability honestly and offer catalog/archive navigation. Do not imply a scheduled matchup exists when it does not.
- [x] **2.7 Handle day rollover.** Expire or refresh an open daily page at its UTC end time and recheck when a suspended tab becomes visible. The database remains the authority for vote eligibility and streaks.

**Primary files:** [login](../app/login/page.tsx), [auth callback](../app/api/auth/callback/route.ts), [Today](../app/today/page.tsx), [daily client](../components/daily-matchup.tsx), [actions](../app/actions.ts), [browser tests](../tests/browser/daily-flow.spec.ts), [deployment notes](DEPLOYMENT.md).

### Phase gate

- [ ] A visitor outside the Supabase project team receives a production sign-in email and completes the daily loop.
- [ ] Reloading or signing in again preserves the vote and prevents a second successful vote that day.
- [ ] A next-day visit presents the next pair; an overnight/suspended-tab test cannot submit yesterday's choice as today's vote.
- [ ] Streaks increment on consecutive UTC days, expire/reset after a missed day, and behave consistently across browser time zones.
- [ ] The owner can schedule and manage content through Admin after the one-time role setup.

**Evidence:** [Phase 2 record](PHASE_2.md), with local test results and pending hosted checks. Retain a dated hosted smoke-test checklist and redacted screenshots. Use local/staging accounts for repeated automation; production participation should be legitimate and documented.

## Phase 3 — Prove database integrity, authorization and recovery

**Outcome:** The backend claims are demonstrated at the database boundary, including paths that bypass the website's forms.

Most of this phase should validate and tighten the existing SQL. Do not replace the transaction model merely to make the implementation look more elaborate.

### Tasks

- [x] **3.1 Verify vote invariants.** Check that each successful vote creates exactly one vote, rating event and daily activity record; both song records, matchup totals, profile totals and streaks agree. Verify equal-and-opposite rating changes using the recorded K-factor.
- [x] **3.2 Exercise concurrent requests.** Test simultaneous duplicate requests for one account and simultaneous votes from different accounts, including opposite choices. Include a small repeatable burst of 50 distinct accounts in local/staging; record timing and errors without treating it as an internet-scale benchmark.
- [x] **3.3 Prove rollback.** Deliberately fail a vote after some intended writes in an isolated test. Confirm there are no partial vote/rating/profile/audit updates and that the durable request budget behaves as documented.
- [x] **3.4 Verify the authorization matrix.** Test anonymous visitors, authenticated owners, another ordinary account and administrators through table access, RPCs and server actions. Users cannot edit roles, derived statistics, other users' history or editorial data.
- [x] **3.5 Verify rate-limit boundaries.** Exercise successful, failed and duplicate requests, minute rollover and separate accounts. Test direct exposed RPC calls as well as server actions; place advertised protections at the trusted entry points if a direct call bypasses them.
- [x] **3.6 Verify catalog transactions.** Confirm imports preserve ratings, enforce provider/metadata constraints and roll back the whole batch if one entry is invalid. Verify invalid scheduling and replacements leave existing days intact.
- [x] **3.7 Exercise migrations.** Test a fresh database, the supported legacy upgrade and an incremental upgrade from the existing daily schema. Verify preserved identities, roles and archived data, migration tracking and seed idempotence. Ship fixes in new ordered migrations.
- [x] **3.8 Demonstrate ranking recovery.** In a disposable database, capture correct derived state, corrupt ratings/counts/snapshots, rebuild, and compare exact restored values. Include multiple days, songs, opponents and historical K-factors; current tests largely exercise a narrower fixture.
- [x] **3.9 Verify recovery failure and concurrency.** Missing/inconsistent audit records must stop recovery without partial changes. A second rebuild must be idempotent. Concurrent voting must either complete safely or return a clear retriable failure, without partial records. Votes, original rating events and user identity/history remain preserved.
- [x] **3.10 Document result visibility.** State exactly which daily result fields are withheld until voting and which cumulative song statistics are public. Test that new endpoints and live subscriptions respect that contract; avoid promising that public aggregate data can never allow inference.

**Primary files:** [current SQL migrations](../supabase/migrations/), [database tests](../tests/database.mjs), [actions](../app/actions.ts), [data access](../lib/data.ts), [authorization helper](../lib/auth.ts), [provider validation](../lib/providers.ts), [catalog validation](../lib/validation.ts).

### Phase gate

- [x] Duplicate concurrency produces one successful vote and one set of derived changes for that account/day.
- [x] The distinct-account burst retains every accepted vote, conserves the rating total and leaves all counters consistent.
- [x] Invalid, unauthorized, expired and rate-limited requests cannot produce partial business writes.
- [x] Direct database/API tests enforce the same authorization and uniqueness guarantees as the interface.
- [x] Supported migrations preserve data; no hosted reset or historical migration rewrite is required.
- [x] Recovery exactly restores documented derived state, preserves its source records and refuses inconsistent input atomically.

**Evidence to retain:** passing named database cases, workload size/results, migration fixture results and before/after recovery comparisons. Explain that event reconstruction is not a full database backup restore. [Phase 3 completion evidence](PHASE_3.md) records passing local and clean-checkout CI results, including the measured fifty-account workload.

## Phase 4 — Deliver live ranking updates and coherent caching

**Outcome:** The “real-time ranking” résumé variant corresponds to visible cross-browser behavior.

**Scope of sign-off:** implementation and all gates below pass locally and in clean-checkout CI. Under the local-only instruction, hosted activation and timing verification remain explicit Phase 7 release requirements. Production and read-only previews are unchanged.

Use Supabase's existing client stack and a narrowly scoped Realtime subscription. Do not introduce a separate application server or new messaging service for this release. If push delivery is ultimately omitted, the release cannot retain the real-time claim unchanged; polling should be described as automatic/near-real-time refresh.

### Tasks

- [x] **4.1 Enable and scope live delivery.** Configure local/staging/production Realtime consistently and publish only the public song changes needed to refresh rankings. Local configuration and migration 0009 implement this scope; staging/production application is prepared for the release rollout. Recheck grants and row-level access; do not publish private votes, profiles, request budgets or admin audit records to public subscribers.
- [x] **4.2 Add a live leaderboard client.** Subscribe while the leaderboard is open, combine duplicate notifications from the two song updates, and refetch authoritative public ranking data. Preserve filters, sort and page; dispose subscriptions on navigation.
- [x] **4.3 Keep cache behavior coherent.** The existing 30-second Next.js cache must not mask a live notification. Use an uncached authoritative public read for the live refresh path; preserve tagged public caching for ordinary page loads and selective invalidation after server-action mutations.
- [x] **4.4 Cover every relevant mutation.** Verify vote, catalog edit/import, availability, ranking rebuild and editorial changes refresh the views they affect. Test a direct authorized vote RPC as well as the normal app action; the RPC does not itself execute Next.js invalidation.
- [x] **4.5 Handle reconnection.** Refetch on reconnect or return to a visible tab, show a clear stale/disconnected state, and retain usable navigation if live delivery fails. Clients never calculate or apply authoritative Elo themselves.
- [x] **4.6 Prove isolation.** Ensure live payloads and public refresh responses contain no account identity or private history. Any later live daily-results view must use viewer-authorized reads, not a public stream of matchup counts.

**Primary files:** [leaderboard](../app/leaderboard/page.tsx), [data access/cache](../lib/data.ts), [browser Supabase client](../lib/supabase/browser.ts), [actions](../app/actions.ts), [Supabase configuration](../supabase/config.toml), new forward migration and focused browser tests.

### Phase gate

- [x] In two separate browser contexts, account A votes and browser B's open leaderboard updates without reload within the five-second normal-condition target.
- [x] A warmed cache and a direct RPC vote cannot leave browser B displaying the old ranking after the live refresh.
- [x] Active filters, sorting and pagination remain correct after updates.
- [x] Reconnection catches missed changes, and repeated navigation does not accumulate subscriptions.
- [x] Subscriber and response checks show no private data exposure.

**Evidence:** [Phase 4 record](PHASE_4.md), with repeatable two-browser Playwright cases, unedited local demo recordings, measured latency, explicit public/private boundaries and the cache/read strategy. Hosted proof remains required before release.

## Phase 5 — Finish the website as a consumer product

**Outcome:** All promised screens form a coherent, useful experience on desktop and mobile.

**Current status:** implementation and local/clean-checkout CI checks complete; manual visitor, owner and screen-reader acceptance is pending. [Phase 5 evidence and checklist](PHASE_5.md) records the boundary.

### Tasks

- [ ] **5.1 Finish Home and onboarding.** Explain Play, Rank and Daily with their distinct questions, scores and participation rules. Keep Daily's sign-in/reset policy clear. Use honest initial/provisional/tied ranking states instead of calling arbitrary starting order community preference. Explain Elo briefly in language a visitor understands. Introduce working mode links as 5A/5B land; do not advertise unavailable functionality as complete.
- [x] **5.2 Finish Today and results.** Make the two songs, provider links, voting state, saved selection, result and next-day action easy to understand. Prevent accidental repeated submissions and provide clear pending, failure and retry feedback.
- [x] **5.3 Finish leaderboard details.** Keep vote counts, win percentage and rating movement visible or directly accessible on narrow screens. Verify every sort/filter, empty results and pagination with a larger isolated fixture than the current twenty songs.
- [x] **5.4 Finish profiles and song history.** Verify display-name editing, empty and populated vote history, pagination, streaks, sample thresholds and rating-history data. Handle insufficient data honestly rather than fabricating insights.
- [x] **5.5 Finish sharing.** Include the canonical site URL in copied/native shared results, retain song-spoiler protection and keep the clipboard fallback usable.
- [x] **5.6 Finish catalog presentation.** Verify all launch songs' title, artist, release metadata and official playback links. Use permission-confirmed artwork where available or an intentional, polished fallback. A modest verified catalog is sufficient; a 200–1,000-song library is not a completion gate.
- [x] **5.7 Improve editorial variety.** Validate the proposed 30-day schedule: no duplicate unordered pair, every included song has at least two different opponents, and the scheduled comparisons connect the included catalog rather than forming isolated pairs. Add brief matchup context where it helps listeners discover the recordings.
- [x] **5.8 Finish the archive.** Feature genuine completed matchups through Admin, with accurate counts and useful song links. Until genuine completed content exists, provide a deliberate empty state and clear navigation; do not seed fake production votes or historical popularity.
- [x] **5.9 Complete admin usability.** Verify editing, CSV/JSON file and paste imports, scheduling, replacement, cancellation, featuring, availability, K-factor changes, audit review and recovery feedback. Routine editorial work must not require production SQL.
- [ ] **5.10 Complete accessibility and device checks.** Test all public and authenticated routes at 320px, a typical phone size and desktop. Include keyboard-only voting/forms, focus, labels, readable errors, contrast, reduced motion and a manual screen-reader pass through sign-in, voting and results.
- [x] **5.11 Finish public presentation.** Add meaningful page titles/descriptions and share metadata; check missing-song/404 and service-failure states. Provide a clear support/contact path and ensure privacy text describes actual storage and provider behavior.

**Primary files:** [app routes](../app/), [components](../components/), [styles](../app/globals.css), [catalog](../data/songs.json), [editorial pairs](../data/editorial-pairs.json), [share formatter](../lib/share.ts), [browser tests](../tests/browser/daily-flow.spec.ts).

### Phase gate

- [ ] A new visitor understands and completes the loop without developer guidance.
- [x] Every public/profile/admin route has usable empty, populated and failure states appropriate to its function.
- [x] Mobile visitors can inspect the values used by leaderboard sorts, with no blocked controls or horizontal overflow.
- [ ] Automated accessibility checks pass and the manual core-flow checks have recorded results.
- [x] Catalog/schedule validation passes, and no production content implies fabricated participation.
- [ ] The owner completes a representative editorial session entirely through the interface.

**Evidence to retain:** route/device checklist, representative screenshots, accessibility results and catalog/schedule validation output.

## Phase 5A — Add continuous preference ranking

**Outcome:** Signed-in listeners can repeatedly choose their preferred song from server-issued pairs, updating the same Elo leaderboard as Daily. See [the Rank contract](PRODUCT_MODES.md#rank-contract).

### Tasks

- [x] **5A.1 Extend storage without losing history.** Add private issued comparisons and identifiable Rank votes through forward migrations. Preserve existing Daily constraints, song IDs, provider metadata, votes, events, profiles and streaks. Reconcile migration numbering with other active branches.
- [x] **5A.2 Issue eligible pairs.** Select two distinct active songs with usable listening sources. After a vote, replace both songs, excluding the previous pair's songs. Handle fewer than four eligible songs honestly. Reuse pending pairs on refresh and define expiry plus a time-bounded repeat-pair cooldown.
- [x] **5A.3 Implement the atomic vote.** Validate account ownership, pair membership, availability and expiry in PostgreSQL. Consume each issued comparison once; lock both songs consistently, apply equal-and-opposite Elo changes and record the historical K-factor/audit event together. Preserve request attempts on failed business writes and keep Rank budgets independent of Daily.
- [x] **5A.4 Extend replay recovery.** Give Daily and Rank a deterministic combined event order and compatible locking. Recover exact mixed-mode ratings, records and snapshots while retaining original votes/events/K-factors. Preserve Daily-specific totals. Test concurrency, corruption, invalid source history and idempotent repeated recovery.
- [x] **5A.5 Connect the product.** Add the Rank interface, listening controls, safe pending/retry states and separately labeled Profile history/counts. Reuse selective invalidation and live ranking refresh. Rank participation cannot increment Daily streaks or consume the daily vote.
- [x] **5A.6 Prove the boundaries.** Test duplicate/opposite-choice races, distinct-account workloads, late rollback, unauthorized/direct-RPC calls, budgets, cooldown/expiry transitions, unavailable songs, mixed Daily/Rank votes and cross-browser live updates.

### Phase gate

- [x] A signed-in listener completes repeated pairs; both cards change after each accepted vote and no daily quota is introduced.
- [x] One issued comparison creates at most one accepted preference and one complete set of Elo/audit changes, including retries and concurrency.
- [x] Daily remains usable after Rank activity, with its one-vote/day constraint, activity and streaks unchanged.
- [x] Mixed Daily/Rank replay exactly restores derived data and refuses inconsistent source records without partial writes.
- [x] New RLS, migration, database, browser and live-ranking checks pass on a recorded clean-checkout CI commit.

**Evidence to retain:** named transaction/recovery cases, old-data preservation checks, pair progression/history screenshots and cross-browser timing. This phase can be developed locally while hosted sign-in remains a separate Phase 2 blocker.

## Phase 5B — Add the higher-rated guessing game

**Outcome:** A listener earns points by correctly identifying the higher-rated song, with one randomly replaced card after each correct answer. See [the Play contract and implemented defaults](PRODUCT_MODES.md#play-contract).

### Tasks

- [x] **5B.1 Issue private server-owned runs and rounds.** Capture the two song IDs and authoritative ratings per round. Reuse an outstanding round after refresh and validate ownership/expiry. Keep answer snapshots and run writes protected from other accounts and public subscriptions.
- [x] **5B.2 Grade and advance atomically.** Award one point for a correct guess against the issued snapshot, reveal it, randomly replace either card and persist the next round once. A retained song gets a fresh snapshot for the next round. Use the documented initial default that an incorrect guess ends the run; client-supplied scores/answers are never authoritative.
- [x] **5B.3 Handle eligibility and failure.** Exclude ties and songs without ranking evidence. Define and test the initial evidence threshold. If an untied replacement cannot be issued, preserve earned points and offer Rank. An expired round or service failure is not a wrong answer. Keep game points separate from Elo and Daily streaks.
- [x] **5B.4 Build the Play experience.** Add the question, accessible song/listening cards, run score, answer reveal, next round and end/restart flow. Use existing account authentication for persisted runs; guest play and a competitive score leaderboard are outside the first version. Provide honest loading, empty, retry and resumed-run states.
- [x] **5B.5 Verify fairness and isolation.** Exercise guesses while concurrent Rank/Daily votes change live ratings, double submissions, opposite-choice races, refresh/retry, expiry, ties and missing replacements. Prove both replacement slots are possible and only one card changes. Assert no Play action creates votes/rating events or modifies Elo/Daily participation. Run mobile, keyboard, accessibility and full browser checks.

### Phase gate

- [x] Correct guesses earn exactly one point; each success preserves one song and randomly replaces the other with a distinct new song.
- [x] Outstanding answers remain stable during concurrent rating changes; duplicate or forged requests cannot inflate scores or reroll a pending round.
- [x] Wrong guesses finish a run under the initial default; insufficient data and operational failures preserve its recorded points.
- [x] Play creates no preference votes, rating changes or Daily activity/streak changes.
- [x] All three modes are reachable and clearly distinguished, with new database/browser checks passing in clean-checkout CI.

**Evidence to retain:** deterministic round/score tests, concurrent-rating snapshots, privacy checks and recorded desktop/mobile runs. Passing existing Daily tests is not evidence that Play works.

## Game-first guest experience — October 16 revision

The owner approved a focused welcome screen, direct Play entry with a first-visit tutorial, and guest Play/Rank/Daily access. Play remains repeatable by explicit choice. Optional accounts provide full history/profile details. See [the implementation, verification and hosted prerequisites](GUEST_EXPERIENCE.md). Phase 6 must cover anonymous signup abuse controls, identity retention and backup/restore. Phase 7 must exercise guest play, account conversion and the new entry flow. Existing Phase 5B evidence records the earlier signed-in implementation and remains valid for its tested snapshot/scoring guarantees.

## Phase 6 — Make the product sustainable to operate

The October 16 audio scope adds a shared 15-second player, four explicitly licensed open recordings, preview-aware Rank entry and audio-only Daily support. See [coverage, licensing and verification](AUDIO_PREVIEWS.md). The original twenty commercial tracks remain unsupported for embedded previews until appropriate permission exists. Include source health, credit/license retention and the authorized assets in release acceptance and backup/deployment checks.

**Outcome:** The website continues working after launch week and can recover from an operational failure.

**Current status:** readiness, monitoring implementation, isolated restore and runbooks pass locally and in clean-checkout CI; hosted activation, alert receipt and private backup destination/export remain pending. [Phase 6 evidence](PHASE_6.md) records the boundary.

### Tasks

- [ ] **6.1 Establish editorial ownership.** Maintain a 30-day scheduled buffer and a weekly replenishment routine. Assign an owner and document how to replace unavailable recordings and recover a cancelled/missing day.
- [ ] **6.2 Monitor actual product availability.** Keep database health separate from Daily availability/schedule coverage and Rank/Play eligibility. Alert the owner when today's valid pair is missing, future coverage falls below 14 days or a mode lacks enough eligible songs. Do not expose future Daily choices, private issued pairs or Play answers through a public readiness endpoint.
- [ ] **6.3 Verify failure notifications.** Deliberately trigger a safe staging failure and confirm the monitor delivers an actionable alert. Record the response steps; a configured monitor without a delivery test is incomplete.
- [ ] **6.4 Exercise backup and restore.** Document the actual backup/export mechanism available on the chosen hosting plan. Restore a backup into an isolated database and verify schema, Daily/Rank votes, combined rating events, Play runs and constraints. Document how auth identities and grants are preserved or reconciled; ranking reconstruction alone does not restore deleted source records or accounts.
- [x] **6.5 Write recovery and deployment runbooks.** Cover missing matchup, email delivery failure, unavailable provider link, inconsistent rankings, failed migration and failed deployment. State when to use ranking rebuild versus database restore, and how to stop/retry writes safely.
- [x] **6.6 Record capacity and service limits.** Capture the small load-test results, expected beta use, relevant hosting/email/realtime limits and what would trigger a later capacity review. No paid upgrade is a default requirement; choose only what the verified release needs.
- [x] **6.7 Update operational documentation.** Replace stale deployment status with dated verified facts, owner actions and known limits. Keep secrets and personal account data out of logs and public evidence.

**Primary files:** [health endpoint](../app/api/health/route.ts), [Admin](../app/admin/page.tsx), [admin data](../lib/data.ts), [deployment notes](DEPLOYMENT.md), [README](../README.md), and a concise operational runbook.

### Phase gate

- [x] Database connectivity and daily-product availability are independently observable.
- [ ] Missing-day/low-queue alerts reach the designated owner.
- [ ] A recorded isolated restore succeeds and the owner can follow the recovery instructions.
- [ ] Content has enough forward coverage to survive a missed weekly maintenance session.
- [ ] Published limits describe measured behavior and current service configuration accurately.

**Evidence to retain:** staging alert test, dated restore rehearsal, queue coverage and runbook links. Monitoring is configured as project work in this phase; this document does not create an automation.

## Phase 7 — Validate the release and package the evidence

**Outcome:** A recruiter can try the site, and an interviewer can inspect reproducible support for every résumé claim.

**Current status:** release/demo/claim evidence, the real beta checklist and the original Phase 7 candidate CI are complete. The integrated candidate requires fresh local validation; see [integration evidence](INTEGRATION.md). Hosted daily availability, sign-in, human acceptance, operational activation and seven actual UTC days remain blockers. [Phase 7 evidence](PHASE_7.md) records the observed public state and the withheld release.

### Tasks

- [ ] **7.1 Freeze and verify a release candidate.** Run the complete test suite and dependency audit on a clean checkout. Confirm Linux CI exercises Chromium, Firefox and WebKit; explicitly record any platform exclusions. Include Daily boundaries, Rank transactions, mixed-mode replay, Play scoring/snapshots, live updates and authorization cases.
- [ ] **7.2 Verify staging then production.** Apply only unapplied ordered migrations after the documented backup step. Repeat the hosted non-team sign-in/vote/reload/profile smoke check on the deployed release; record exactly which commit and migration versions it uses.
- [ ] **7.3 Run a small real-user beta.** Have at least three people independently try Play, Rank and Daily. Observe at least seven consecutive UTC Daily matchup days, including legitimate consecutive-day and missed-day participation. Rank votes and Play points cannot substitute for elapsed Daily participation. Keep accelerated edge-case fixtures in local/staging.
- [ ] **7.4 Resolve release blockers.** Close reproducible issues in sign-in, voting, authorization, consistency, recovery and core usability. A missing essential check is a blocker, not a passing result. Minor cosmetic issues may remain in a named backlog.
- [ ] **7.5 Prepare a concise README/demo.** Include the live URL, setup instructions, architecture, product screenshots and reproducible verification commands. Provide an interview demo path for Play, continuous Rank, Daily voting, live rankings, admin tools and isolated mixed-mode recovery. Scope the one-vote/day résumé claim explicitly to Daily. Never expose a public admin credential.
- [ ] **7.6 Create a claim-to-evidence record.** Link each claim below to its implementation, named tests, passing CI run and, where relevant, a dated hosted demonstration. Redact email addresses, tokens and private identifiers.
- [ ] **7.7 Publish a release record.** Create the release/tag after acceptance, list supported behavior and known limits, and distinguish live facts from local tests. Update the roadmap gates with evidence references rather than silently checking boxes.

### Phase gate

- [ ] All required phase gates pass on the release candidate.
- [ ] The live site supplies a valid daily matchup throughout the seven-day observation period.
- [ ] Public email delivery, saved voting, live ranking updates and owner workflows have current hosted evidence.
- [ ] Database/browser/CI evidence is reproducible from the documented checkout.
- [ ] No critical/high-impact authorization, data-integrity or core-flow defect remains unresolved.
- [ ] Every retained résumé claim maps to actual behavior and evidence; unsupported scale, uptime or timing claims are removed.

## Résumé claim-to-evidence checklist

| Résumé behavior                                                 | Current starting point                                                                              | Required phases | Evidence needed before sign-off                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js, React, TypeScript, PostgreSQL, Supabase full-stack app | Implemented; build/type/unit checks passed in the status review                                     | 1, 2, 5, 7      | Clean build, source architecture and hosted user flow                                                                                             |
| Daily matchups, profiles, history and streaks                   | Implemented; live daily content missing at review                                                   | 2, 3, 5, 7      | Hosted vote persistence plus automated UTC/streak/history tests                                                                                   |
| Continuous preference ranking                                   | Implemented and verified locally/in CI; hosted rollout pending                                      | 5A, 6, 7        | Issued pairs, atomic votes, budgets/cooldowns, mixed-mode recovery and hosted loop                                                                |
| Higher-rated guessing game                                      | Phase 5B local/CI gates passed; hosted rollout pending                                              | 5B, 6, 7        | Server-graded snapshot answers, exactly-once points, random single-card replacement and no Elo effects                                            |
| Elo-ranked leaderboard                                          | Implemented; live catalog at starting ratings                                                       | 3–5, 7          | Audited rating changes, correct sorting/filtering and real user participation                                                                     |
| Real-time ranking platform                                      | Implemented and verified across four browser projects in CI; hosted verification pending            | 4, 5A, 7        | Push subscription, two-browser test and hosted demonstration                                                                                      |
| Atomic concurrent voting and Daily uniqueness                   | Daily and Rank guarantees verified locally/in CI                                                    | 3, 5A, 7        | Daily account/day uniqueness, Rank issued-comparison uniqueness, duplicate races, distinct-account workloads, rollback and consistency assertions |
| Authentication and Row Level Security                           | Implemented; public delivery/setup unverified                                                       | 2, 3, 7         | Non-team hosted login and direct database authorization matrix                                                                                    |
| Constraints, rate limiting and transactional catalog updates    | Implemented across SQL and server actions; coverage must be checked at exposed boundaries           | 3, 7            | Direct RPC/table tests, durable-budget cases and atomic import rollback                                                                           |
| Administrator catalog and scheduling workflows                  | Implemented; owner access unverified                                                                | 2, 5–7          | Owner workflow demonstration and ordinary-user denial tests                                                                                       |
| Schema migrations                                               | Ordered forward migrations through 0012, with 0011 reserved; fresh/legacy/incremental checks passed | 1, 3, 7         | Fresh/legacy/incremental fixture results and recorded deployment versions                                                                         |
| Replay-based ranking recovery                                   | Mixed Daily/Rank recovery verified locally/in CI                                                    | 3, 5A, 6, 7     | Mixed Daily/Rank corruption/rebuild comparison, historical K-factor and event-order preservation, idempotence and failure rollback                |
| Selective cache invalidation                                    | Tagged public cache and action invalidations exist                                                  | 3, 4, 7         | Warm-cache mutation tests, direct-RPC/live-path checks and private-state isolation                                                                |
| Automated database and Playwright testing                       | Current clean-checkout CI passed 26 unit, 65 database and 76 browser cases                          | 1, 3–5A, 7      | Current passing clean-checkout commands, named cases and CI link                                                                                  |
| Reliable cloud database operations                              | Managed deployment exists; restore/monitoring unverified                                            | 2, 6, 7         | Hosted smoke tests, availability alert and isolated restore rehearsal                                                                             |

## External setup and ownership

Code changes and local tests can proceed independently where dependencies allow. These items require access to the relevant accounts or a human participant; the document does not assume those steps are already complete.

| Item                                                          | Owner/dependency                                                               | Phase |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----- |
| SMTP provider, sending-domain verification and auth redirects | Project owner/provider account access; approve any actual cost before purchase | 2     |
| First owner sign-in and exact-account admin assignment        | Owner identity and trusted database setup access                               | 2     |
| Staging backend and environment separation                    | Hosting/database project access; read-only previews suffice until ready        | 1–2   |
| Recording availability and artwork permission                 | Editorial owner; licensed artwork is optional                                  | 5     |
| Monitoring destination and backup/restore access              | Project owner/hosting account access                                           | 6     |
| Independent beta and consecutive-day participation            | At least three real participants plus seven elapsed UTC days                   | 7     |

## Explicitly outside this release

Friends, tournaments, personalized recommendations, voting modes beyond Play/Rank/Daily, a competitive game-score leaderboard, native mobile apps, paid subscriptions, a separate backend service and a large-scale infrastructure rewrite remain outside the initial scope. Play, Rank, guest access and authorized 15-second previews are required by the owner's revised product direction. Commercial-preview coverage depends on explicit permission. A much larger catalog and complete artwork coverage can follow after the core release.

No calendar deadline is invented here: email/domain setup, environment access and the seven-day beta introduce external or elapsed-time dependencies. Phase completion is based on evidence, not a subjective percentage.

## Final release checklist

- [x] Phase 1 — Baseline and isolation passed: [October 15 verification evidence](PHASE_1.md)
- [ ] Phase 2 — Public daily loop passed: evidence link __________
- [x] Phase 3 — Database guarantees passed: [October 15 local and CI evidence](PHASE_3.md)
- [x] Phase 4 — Live rankings and cache consistency passed: [October 15 local and CI evidence; hosted rollout still required](PHASE_4.md)
- [ ] Phase 5 — Consumer/admin experience passed: evidence link __________
- [x] Phase 5A — Continuous Rank and mixed-mode integrity/recovery passed: [October 16 local and CI evidence](PHASE_5A.md)
- [x] Phase 5B — Higher-rated Play game and scoring isolation passed locally/CI: [evidence](PHASE_5B.md)
- [ ] Phase 6 — Sustainable operations passed: evidence link __________
- [ ] Phase 7 — Release and résumé evidence passed: evidence link __________
- [ ] Release commit/tag, deployment date and migration versions recorded: __________
- [ ] Remaining minor issues and measured limitations published: __________

Musicale is complete for this scope when these gates pass. It can then be presented as a finished portfolio product with defensible engineering claims, while ordinary content maintenance and dependency updates continue.
