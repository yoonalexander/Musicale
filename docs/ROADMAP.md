# Musicale completion roadmap

Created October 15, 2026. Based on the [project status review](PROJECT_STATUS.md), the current implementation and the supplied résumé descriptions.

## Finish line

Ship a complete, maintained public music voting product that supports the behavior described across the résumés and has reproducible evidence behind its engineering claims.

“Done” means an ordinary visitor can use the deployed product, its database remains correct under concurrent and unauthorized requests, the owner can operate and recover it, and another developer can reproduce its tests. A feature is complete only after its acceptance checks pass. Existing code, previous test results and an enabled form are not substitutes for current verification.

All seven phase gates below are required for this release. The proposed numerical targets are acceptance targets for this project, not claims about current traffic, uptime or capacity. Implementation progress and dated evidence are recorded per phase.

## Product contract

Musicale gives everyone one shared editorial matchup per UTC day. Visitors listen to two songs on official provider pages, sign in, vote once, see community results and retain participation history. Votes update an Elo-ranked song catalog. An administrator manages recordings, imports, availability and future matchups.

The finished release includes:

- Daily matchups, results, profiles, paginated voting history and streaks.
- Email authentication, database-enforced authorization, input constraints and durable rate limits.
- Atomic vote processing and catalog imports, with auditable changes.
- Live leaderboard updates across open browsers and selective cache invalidation.
- Ordered schema migrations, recovery from recorded rating events and a tested backup/restore procedure.
- Automated database and Playwright browser checks, passing CI and a working public deployment.
- A usable mobile/desktop interface, verified provider links and a sustainable editorial schedule.

### Precise meanings of the résumé claims

| Claim | Required meaning and proof |
| --- | --- |
| One vote per user per day | At most one successful vote per authenticated account per UTC calendar day. Database constraints and transaction logic enforce this, including concurrent requests and direct RPC calls. This does not claim one vote per human across multiple accounts. |
| Atomic transactions | A successful vote writes the vote, both song records, matchup totals, participation, profile streak and rating event together. A failed vote leaves all of those unchanged; a rejected attempt may still consume its durable request budget. |
| Real-time ranking | Another active browser receives a server-pushed change notification and displays authoritative updated rankings without manual reload. The normal-condition acceptance target is within five seconds of a committed vote. This is not a hard real-time timing guarantee. |
| Replay-based recovery | Reconstruct ratings, win/loss records, matchup totals and snapshots from preserved historical rating events and votes, starting from the documented baseline. Preserve original events and historical K-factors. Do not rerun old votes with today's K-factor. |
| Selective cache invalidation | Successful relevant mutations invalidate affected public ranking data and route views. Private user state is never shared through the public cache. Live refreshes cannot be masked by stale cached responses. |
| Concurrency and reliability | Automated tests demonstrate correctness for specified concurrent workloads, with measured results recorded. Do not imply unlimited scale or production traffic that has not occurred. |

The “real-time” claim is an explicit remaining feature: the current app has no live leaderboard subscription, and local Supabase Realtime is disabled. Recovery already has a substantial implementation, but its exact guarantees must be exercised and documented.

## Phase order

| Phase | Outcome | Depends on | Initial state |
| --- | --- | --- | --- |
| 1 | Reproducible development, isolated testing and passing baseline checks | Nothing | Partial; database/browser checks were not rerun during the review |
| 2 | Working public sign-in and daily voting loop | 1 | Launch operations incomplete or unverified; Today was empty |
| 3 | Proven transaction, authorization, migration and recovery guarantees | 1; use 2 for hosted smoke checks | Substantial implementation; further verification required |
| 4 | Live rankings with consistent caching | 3 | Cache invalidation exists; cross-browser live behavior missing |
| 5 | Complete consumer and administrator experience | 2–4 | Core screens exist; usability and content gaps remain |
| 6 | Sustainable content, monitoring and recovery operations | 2–5 | Incomplete or unverified |
| 7 | Release acceptance and résumé evidence | 1–6 | Not complete |

Execute in this order by default. Safe local work in Phase 3 can continue while external email setup in Phase 2 is pending. Build the specific tests alongside their phases; Phase 7 reruns and records the complete result.

## Phase 1 — Establish a reproducible, isolated baseline

**Outcome:** Changes can be developed and verified without touching production data.

### Tasks

- [x] **1.1 Inspect current environments.** Recheck production and preview settings rather than assuming the October 1 deployment notes are still current. Record configuration status without copying secrets into the repository.
- [x] **1.2 Isolate previews.** Remove production database access from preview deployments. Use read-only preview mode until an isolated staging Supabase project is available. Configure staging URLs and auth redirects together before staging mutations.
- [x] **1.3 Restore local verification.** Start Docker and the project-specific local Supabase stack. Confirm ports, local email catcher and the test scripts' protections against hosted databases.
- [x] **1.4 Fix the dependency advisory.** Update the affected compatible transitive dependency in the lockfile; rerun the audit. Recheck current advisories at implementation time rather than treating the review's advisory list as permanent.
- [x] **1.5 Align display-name limits.** Use 60 characters consistently in the form, server action and database RPC; add a forward migration for the RPC change. Keep applied historical migrations unchanged. Verify 60 succeeds and 61 fails clearly.
- [ ] **1.6 Run the baseline.** Run the existing unit, database, production-build, browser and TypeScript checks. Resolve failures and verify the GitHub workflow on the same commit. Address the local workspace-root warning if it affects build tracing or reproducibility.

**Primary files:** [package.json](../package.json), [lockfile](../package-lock.json), [verification workflow](../.github/workflows/verify.yml), [Supabase configuration](../supabase/config.toml), [profile page](../app/profile/page.tsx), [actions](../app/actions.ts), [migrations](../supabase/migrations/), [deployment notes](DEPLOYMENT.md).

### Phase gate

- [ ] A clean checkout can start the documented local backend and run `npm run verify` successfully.
- [x] `npm audit` passes the existing CI policy; any exception is explicitly documented and reviewed, never silently ignored.
- [ ] CI passes on the tested commit, with failures retaining useful browser evidence.
- [ ] Preview mutations cannot reach the production backend; read-only previews are visibly labeled.
- [x] The display-name boundary is covered by an actual database/application check.

**Evidence:** [Phase 1 working record](PHASE_1.md), with command results, environment decisions and outstanding gate checks. Retain the tested commit SHA and CI run link when complete.

## Phase 2 — Complete the public daily loop

**Outcome:** An ordinary non-team visitor can use the deployed product from sign-in through a saved vote.

### Tasks

- [ ] **2.1 Complete public email delivery.** Verify or configure the email provider, sending domain and Supabase SMTP settings. Keep credentials in provider settings, not frontend variables or Git. Verify exact production callback URLs.
- [ ] **2.2 Establish the owner account.** Sign in as the owner and assign that exact account the admin role through the trusted setup path. Verify an ordinary account remains unable to use admin actions.
- [ ] **2.3 Restore today's matchup.** Schedule an active pair with working provider links. Populate the next 30 UTC days using the existing scheduler; Phase 5 finishes the variety/content checks.
- [ ] **2.4 Verify hosted persistence.** With an ordinary non-team account, sign in, listen, vote, reload, revisit Today, open Profile and confirm the saved choice and first-day streak.
- [ ] **2.5 Finish authentication feedback.** Show a pending state, prevent accidental repeated submissions, and provide clear recovery for expired/used links, email delivery failure and session expiry. Preserve safe error messages.
- [ ] **2.6 Finish unavailable states.** When Today has no valid pair, explain availability honestly and offer catalog/archive navigation. Do not imply a scheduled matchup exists when it does not.
- [ ] **2.7 Handle day rollover.** Expire or refresh an open daily page at its UTC end time and recheck when a suspended tab becomes visible. The database remains the authority for vote eligibility and streaks.

**Primary files:** [login](../app/login/page.tsx), [auth callback](../app/api/auth/callback/route.ts), [Today](../app/today/page.tsx), [daily client](../components/daily-matchup.tsx), [actions](../app/actions.ts), [browser tests](../tests/browser/daily-flow.spec.ts), [deployment notes](DEPLOYMENT.md).

### Phase gate

- [ ] A visitor outside the Supabase project team receives a production sign-in email and completes the daily loop.
- [ ] Reloading or signing in again preserves the vote and prevents a second successful vote that day.
- [ ] A next-day visit presents the next pair; an overnight/suspended-tab test cannot submit yesterday's choice as today's vote.
- [ ] Streaks increment on consecutive UTC days, expire/reset after a missed day, and behave consistently across browser time zones.
- [ ] The owner can schedule and manage content through Admin after the one-time role setup.

**Evidence to retain:** a dated hosted smoke-test checklist and redacted screenshots. Use local/staging accounts for repeated automation; production participation should be legitimate and documented.

## Phase 3 — Prove database integrity, authorization and recovery

**Outcome:** The backend claims are demonstrated at the database boundary, including paths that bypass the website's forms.

Most of this phase should validate and tighten the existing SQL. Do not replace the transaction model merely to make the implementation look more elaborate.

### Tasks

- [ ] **3.1 Verify vote invariants.** Check that each successful vote creates exactly one vote, rating event and daily activity record; both song records, matchup totals, profile totals and streaks agree. Verify equal-and-opposite rating changes using the recorded K-factor.
- [ ] **3.2 Exercise concurrent requests.** Test simultaneous duplicate requests for one account and simultaneous votes from different accounts, including opposite choices. Include a small repeatable burst of 50 distinct accounts in local/staging; record timing and errors without treating it as an internet-scale benchmark.
- [ ] **3.3 Prove rollback.** Deliberately fail a vote after some intended writes in an isolated test. Confirm there are no partial vote/rating/profile/audit updates and that the durable request budget behaves as documented.
- [ ] **3.4 Verify the authorization matrix.** Test anonymous visitors, authenticated owners, another ordinary account and administrators through table access, RPCs and server actions. Users cannot edit roles, derived statistics, other users' history or editorial data.
- [ ] **3.5 Verify rate-limit boundaries.** Exercise successful, failed and duplicate requests, minute rollover and separate accounts. Test direct exposed RPC calls as well as server actions; place advertised protections at the trusted entry points if a direct call bypasses them.
- [ ] **3.6 Verify catalog transactions.** Confirm imports preserve ratings, enforce provider/metadata constraints and roll back the whole batch if one entry is invalid. Verify invalid scheduling and replacements leave existing days intact.
- [ ] **3.7 Exercise migrations.** Test a fresh database, the supported legacy upgrade and an incremental upgrade from the existing daily schema. Verify preserved identities, roles and archived data, migration tracking and seed idempotence. Ship fixes in new ordered migrations.
- [ ] **3.8 Demonstrate ranking recovery.** In a disposable database, capture correct derived state, corrupt ratings/counts/snapshots, rebuild, and compare exact restored values. Include multiple days, songs, opponents and historical K-factors; current tests largely exercise a narrower fixture.
- [ ] **3.9 Verify recovery failure and concurrency.** Missing/inconsistent audit records must stop recovery without partial changes. A second rebuild must be idempotent. Concurrent voting must either complete safely or return a clear retriable failure, without partial records. Votes, original rating events and user identity/history remain preserved.
- [ ] **3.10 Document result visibility.** State exactly which daily result fields are withheld until voting and which cumulative song statistics are public. Test that new endpoints and live subscriptions respect that contract; avoid promising that public aggregate data can never allow inference.

**Primary files:** [current SQL migrations](../supabase/migrations/), [database tests](../tests/database.mjs), [actions](../app/actions.ts), [data access](../lib/data.ts), [authorization helper](../lib/auth.ts), [provider validation](../lib/providers.ts), [catalog validation](../lib/validation.ts).

### Phase gate

- [ ] Duplicate concurrency produces one successful vote and one set of derived changes for that account/day.
- [ ] The distinct-account burst retains every accepted vote, conserves the rating total and leaves all counters consistent.
- [ ] Invalid, unauthorized, expired and rate-limited requests cannot produce partial business writes.
- [ ] Direct database/API tests enforce the same authorization and uniqueness guarantees as the interface.
- [ ] Supported migrations preserve data; no hosted reset or historical migration rewrite is required.
- [ ] Recovery exactly restores documented derived state, preserves its source records and refuses inconsistent input atomically.

**Evidence to retain:** passing named database cases, workload size/results, migration fixture results and before/after recovery comparisons. Explain that event reconstruction is not a full database backup restore.

## Phase 4 — Deliver live ranking updates and coherent caching

**Outcome:** The “real-time ranking” résumé variant corresponds to visible cross-browser behavior.

Use Supabase's existing client stack and a narrowly scoped Realtime subscription. Do not introduce a separate application server or new messaging service for this release. If push delivery is ultimately omitted, the release cannot retain the real-time claim unchanged; polling should be described as automatic/near-real-time refresh.

### Tasks

- [ ] **4.1 Enable and scope live delivery.** Configure local/staging/production Realtime consistently and publish only the public song changes needed to refresh rankings. Recheck grants and row-level access; do not publish private votes, profiles, request budgets or admin audit records to public subscribers.
- [ ] **4.2 Add a live leaderboard client.** Subscribe while the leaderboard is open, combine duplicate notifications from the two song updates, and refetch authoritative public ranking data. Preserve filters, sort and page; dispose subscriptions on navigation.
- [ ] **4.3 Keep cache behavior coherent.** The existing 30-second Next.js cache must not mask a live notification. Use an uncached authoritative public read for the live refresh path; preserve tagged public caching for ordinary page loads and selective invalidation after server-action mutations.
- [ ] **4.4 Cover every relevant mutation.** Verify vote, catalog edit/import, availability, ranking rebuild and editorial changes refresh the views they affect. Test a direct authorized vote RPC as well as the normal app action; the RPC does not itself execute Next.js invalidation.
- [ ] **4.5 Handle reconnection.** Refetch on reconnect or return to a visible tab, show a clear stale/disconnected state, and retain usable navigation if live delivery fails. Clients never calculate or apply authoritative Elo themselves.
- [ ] **4.6 Prove isolation.** Ensure live payloads and public refresh responses contain no account identity or private history. Any later live daily-results view must use viewer-authorized reads, not a public stream of matchup counts.

**Primary files:** [leaderboard](../app/leaderboard/page.tsx), [data access/cache](../lib/data.ts), [browser Supabase client](../lib/supabase/browser.ts), [actions](../app/actions.ts), [Supabase configuration](../supabase/config.toml), new forward migration and focused browser tests.

### Phase gate

- [ ] In two separate browser contexts, account A votes and browser B's open leaderboard updates without reload within the five-second normal-condition target.
- [ ] A warmed cache and a direct RPC vote cannot leave browser B displaying the old ranking after the live refresh.
- [ ] Active filters, sorting and pagination remain correct after updates.
- [ ] Reconnection catches missed changes, and repeated navigation does not accumulate subscriptions.
- [ ] Subscriber and response checks show no private data exposure.

**Evidence to retain:** repeatable two-browser Playwright test, an unedited demo of live behavior, measured latency and the documented cache/read strategy.

## Phase 5 — Finish the website as a consumer product

**Outcome:** All promised screens form a coherent, useful experience on desktop and mobile.

### Tasks

- [ ] **5.1 Finish Home and onboarding.** Explain the daily loop, sign-in requirement and reset policy. Use honest initial/provisional/tied ranking states instead of calling arbitrary starting order community preference. Explain Elo briefly in language a visitor understands.
- [ ] **5.2 Finish Today and results.** Make the two songs, provider links, voting state, saved selection, result and next-day action easy to understand. Prevent accidental repeated submissions and provide clear pending, failure and retry feedback.
- [ ] **5.3 Finish leaderboard details.** Keep vote counts, win percentage and rating movement visible or directly accessible on narrow screens. Verify every sort/filter, empty results and pagination with a larger isolated fixture than the current twenty songs.
- [ ] **5.4 Finish profiles and song history.** Verify display-name editing, empty and populated vote history, pagination, streaks, sample thresholds and rating-history data. Handle insufficient data honestly rather than fabricating insights.
- [ ] **5.5 Finish sharing.** Include the canonical site URL in copied/native shared results, retain song-spoiler protection and keep the clipboard fallback usable.
- [ ] **5.6 Finish catalog presentation.** Verify all launch songs' title, artist, release metadata and official playback links. Use permission-confirmed artwork where available or an intentional, polished fallback. A modest verified catalog is sufficient; a 200–1,000-song library is not a completion gate.
- [ ] **5.7 Improve editorial variety.** Validate the proposed 30-day schedule: no duplicate unordered pair, every included song has at least two different opponents, and the scheduled comparisons connect the included catalog rather than forming isolated pairs. Add brief matchup context where it helps listeners discover the recordings.
- [ ] **5.8 Finish the archive.** Feature genuine completed matchups through Admin, with accurate counts and useful song links. Until genuine completed content exists, provide a deliberate empty state and clear navigation; do not seed fake production votes or historical popularity.
- [ ] **5.9 Complete admin usability.** Verify editing, CSV/JSON file and paste imports, scheduling, replacement, cancellation, featuring, availability, K-factor changes, audit review and recovery feedback. Routine editorial work must not require production SQL.
- [ ] **5.10 Complete accessibility and device checks.** Test all public and authenticated routes at 320px, a typical phone size and desktop. Include keyboard-only voting/forms, focus, labels, readable errors, contrast, reduced motion and a manual screen-reader pass through sign-in, voting and results.
- [ ] **5.11 Finish public presentation.** Add meaningful page titles/descriptions and share metadata; check missing-song/404 and service-failure states. Provide a clear support/contact path and ensure privacy text describes actual storage and provider behavior.

**Primary files:** [app routes](../app/), [components](../components/), [styles](../app/globals.css), [catalog](../data/songs.json), [editorial pairs](../data/editorial-pairs.json), [share formatter](../lib/share.ts), [browser tests](../tests/browser/daily-flow.spec.ts).

### Phase gate

- [ ] A new visitor understands and completes the loop without developer guidance.
- [ ] Every public/profile/admin route has usable empty, populated and failure states appropriate to its function.
- [ ] Mobile visitors can inspect the values used by leaderboard sorts, with no blocked controls or horizontal overflow.
- [ ] Automated accessibility checks pass and the manual core-flow checks have recorded results.
- [ ] Catalog/schedule validation passes, and no production content implies fabricated participation.
- [ ] The owner completes a representative editorial session entirely through the interface.

**Evidence to retain:** route/device checklist, representative screenshots, accessibility results and catalog/schedule validation output.

## Phase 6 — Make the product sustainable to operate

**Outcome:** The website continues working after launch week and can recover from an operational failure.

### Tasks

- [ ] **6.1 Establish editorial ownership.** Maintain a 30-day scheduled buffer and a weekly replenishment routine. Assign an owner and document how to replace unavailable recordings and recover a cancelled/missing day.
- [ ] **6.2 Monitor actual product availability.** Keep database health separate from “today is playable” and schedule coverage. Alert the owner when today's valid pair is missing or future coverage falls below 14 days. Do not expose future song choices through a public readiness endpoint.
- [ ] **6.3 Verify failure notifications.** Deliberately trigger a safe staging failure and confirm the monitor delivers an actionable alert. Record the response steps; a configured monitor without a delivery test is incomplete.
- [ ] **6.4 Exercise backup and restore.** Document the actual backup/export mechanism available on the chosen hosting plan. Restore a backup into an isolated database and verify schema, votes, rating events and constraints. Document how auth identities and grants are preserved or reconciled; ranking reconstruction alone does not restore deleted source records or accounts.
- [ ] **6.5 Write recovery and deployment runbooks.** Cover missing matchup, email delivery failure, unavailable provider link, inconsistent rankings, failed migration and failed deployment. State when to use ranking rebuild versus database restore, and how to stop/retry writes safely.
- [ ] **6.6 Record capacity and service limits.** Capture the small load-test results, expected beta use, relevant hosting/email/realtime limits and what would trigger a later capacity review. No paid upgrade is a default requirement; choose only what the verified release needs.
- [ ] **6.7 Update operational documentation.** Replace stale deployment status with dated verified facts, owner actions and known limits. Keep secrets and personal account data out of logs and public evidence.

**Primary files:** [health endpoint](../app/api/health/route.ts), [Admin](../app/admin/page.tsx), [admin data](../lib/data.ts), [deployment notes](DEPLOYMENT.md), [README](../README.md), and a concise operational runbook.

### Phase gate

- [ ] Database connectivity and daily-product availability are independently observable.
- [ ] Missing-day/low-queue alerts reach the designated owner.
- [ ] A recorded isolated restore succeeds and the owner can follow the recovery instructions.
- [ ] Content has enough forward coverage to survive a missed weekly maintenance session.
- [ ] Published limits describe measured behavior and current service configuration accurately.

**Evidence to retain:** staging alert test, dated restore rehearsal, queue coverage and runbook links. Monitoring is configured as project work in this phase; this document does not create an automation.

## Phase 7 — Validate the release and package the evidence

**Outcome:** A recruiter can try the site, and an interviewer can inspect reproducible support for every résumé claim.

### Tasks

- [ ] **7.1 Freeze and verify a release candidate.** Run the complete test suite and dependency audit on a clean checkout. Confirm Linux CI exercises Chromium, Firefox and WebKit; explicitly record any platform exclusions. Include the new day-boundary, live-update, authorization and recovery cases.
- [ ] **7.2 Verify staging then production.** Apply only unapplied ordered migrations after the documented backup step. Repeat the hosted non-team sign-in/vote/reload/profile smoke check on the deployed release; record exactly which commit and migration versions it uses.
- [ ] **7.3 Run a small real-user beta.** Have at least three people independently try the product. Observe at least seven consecutive UTC matchup days, including legitimate consecutive-day and missed-day participation. Keep accelerated edge-case fixtures in local/staging.
- [ ] **7.4 Resolve release blockers.** Close reproducible issues in sign-in, voting, authorization, consistency, recovery and core usability. A missing essential check is a blocker, not a passing result. Minor cosmetic issues may remain in a named backlog.
- [ ] **7.5 Prepare a concise README/demo.** Include the live URL, setup instructions, architecture, product screenshots and reproducible verification commands. Provide an interview demo path for daily voting, live rankings, admin tools and isolated recovery. Never expose a public admin credential.
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

| Résumé behavior | Current starting point | Required phases | Evidence needed before sign-off |
| --- | --- | --- | --- |
| Next.js, React, TypeScript, PostgreSQL, Supabase full-stack app | Implemented; build/type/unit checks passed in the status review | 1, 2, 5, 7 | Clean build, source architecture and hosted user flow |
| Daily matchups, profiles, history and streaks | Implemented; live daily content missing at review | 2, 3, 5, 7 | Hosted vote persistence plus automated UTC/streak/history tests |
| Elo-ranked leaderboard | Implemented; live catalog at starting ratings | 3–5, 7 | Audited rating changes, correct sorting/filtering and real user participation |
| Real-time ranking platform | No cross-browser live delivery implemented | 4, 7 | Push subscription, two-browser test and hosted demonstration |
| Atomic concurrent voting and daily uniqueness | Transaction/constraint implementation and existing tests | 3, 7 | Duplicate race, distinct-account burst, rollback and consistency assertions |
| Authentication and Row Level Security | Implemented; public delivery/setup unverified | 2, 3, 7 | Non-team hosted login and direct database authorization matrix |
| Constraints, rate limiting and transactional catalog updates | Implemented across SQL and server actions; coverage must be checked at exposed boundaries | 3, 7 | Direct RPC/table tests, durable-budget cases and atomic import rollback |
| Administrator catalog and scheduling workflows | Implemented; owner access unverified | 2, 5–7 | Owner workflow demonstration and ordinary-user denial tests |
| Schema migrations | Six existing migrations and upgrade-oriented tests | 1, 3, 7 | Fresh/legacy/incremental fixture results and recorded deployment versions |
| Replay-based ranking recovery | Reconstruction from original deltas exists | 3, 6, 7 | Multi-day corruption/rebuild comparison, historical K-factor preservation, idempotence and failure rollback |
| Selective cache invalidation | Tagged public cache and action invalidations exist | 3, 4, 7 | Warm-cache mutation tests, direct-RPC/live-path checks and private-state isolation |
| Automated database and Playwright testing | Suites and CI exist; integration suites were not rerun during the status review | 1, 3–5, 7 | Current passing clean-checkout commands, named cases and CI link |
| Reliable cloud database operations | Managed deployment exists; restore/monitoring unverified | 2, 6, 7 | Hosted smoke tests, availability alert and isolated restore rehearsal |

## External setup and ownership

Code changes and local tests can proceed independently where dependencies allow. These items require access to the relevant accounts or a human participant; the document does not assume those steps are already complete.

| Item | Owner/dependency | Phase |
| --- | --- | --- |
| SMTP provider, sending-domain verification and auth redirects | Project owner/provider account access; approve any actual cost before purchase | 2 |
| First owner sign-in and exact-account admin assignment | Owner identity and trusted database setup access | 2 |
| Staging backend and environment separation | Hosting/database project access; read-only previews suffice until ready | 1–2 |
| Recording availability and artwork permission | Editorial owner; licensed artwork is optional | 5 |
| Monitoring destination and backup/restore access | Project owner/hosting account access | 6 |
| Independent beta and consecutive-day participation | At least three real participants plus seven elapsed UTC days | 7 |

## Explicitly outside this release

Friends, tournaments, personalized recommendations, additional voting modes, native mobile apps, paid subscriptions, audio hosting, mandatory embedded players, a separate backend service and a large-scale infrastructure rewrite are not required by the supplied claims. A much larger catalog and complete artwork coverage can follow after the core release. Do not add them to the critical path unless the product scope changes.

No calendar deadline is invented here: email/domain setup, environment access and the seven-day beta introduce external or elapsed-time dependencies. Phase completion is based on evidence, not a subjective percentage.

## Final release checklist

- [ ] Phase 1 — Baseline and isolation passed: evidence link __________
- [ ] Phase 2 — Public daily loop passed: evidence link __________
- [ ] Phase 3 — Database guarantees passed: evidence link __________
- [ ] Phase 4 — Live rankings and cache consistency passed: evidence link __________
- [ ] Phase 5 — Consumer/admin experience passed: evidence link __________
- [ ] Phase 6 — Sustainable operations passed: evidence link __________
- [ ] Phase 7 — Release and résumé evidence passed: evidence link __________
- [ ] Release commit/tag, deployment date and migration versions recorded: __________
- [ ] Remaining minor issues and measured limitations published: __________

Musicale is complete for this scope when these gates pass. It can then be presented as a finished portfolio product with defensible engineering claims, while ordinary content maintenance and dependency updates continue.
