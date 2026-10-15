# Musicale project status — October 15, 2026

What this repo does: Musicale is a shared daily music vote. Everyone receives the same two songs, listens through an official provider, chooses one, and contributes to a cumulative song ranking. Accounts preserve votes, streaks and listening history; editors maintain the catalog and daily schedule.

**Assessment: substantial MVP implementation, incomplete public launch, and a thin consumer experience.** The current live website cannot deliver its central daily activity because Today has no matchup. The foundation is worth keeping. A rewrite is not justified by this review.

I assessed it as an early public beta with concurrent visitors and one daily editorial matchup, not a high-volume music streaming service. There is no defensible completion percentage without an agreed acceptance checklist. Passing a build and having routes for every feature does not establish a finished product.

## Purpose, function and goals

The intended experience is a short daily ritual:

1. Open today's shared matchup.
2. Listen to both recordings on their providers.
3. Sign in through an email magic link and vote once.
4. See how the community voted, retain a streak, and share a result without revealing the songs.
5. Explore song rankings and personal history, then return for the next day.

Elo is a rating system that adjusts a song's score according to its opponent's rating. Here each individual vote updates both songs, while an audit record preserves the original rating changes. The product's goals are music discovery, a repeat daily habit, a shared conversation and a community-derived ranking. These are inferred from the README, refactor notes and implemented flows; they are not evidence of achieved engagement.

The site currently provides external playback links. It does not stream or host audio. Embedded playback, friends, tournaments and personalized modes are outside the documented initial scope. Their absence alone does not make the MVP broken.

## What visitors actually get

The following were checked on the deployed website during this review:

| Area | Observed state | Assessment |
| --- | --- | --- |
| Home | Clear headline and calls to action; starting ratings presented as the crowd's top three | Visually coherent, but its activity claims need an honest launch state |
| Today | “Today's matchup is being tuned. Check back shortly.” | Main product experience unavailable |
| Leaderboard | Twenty songs, all displaying 1500 and provisional labels; artist filtering returns Respect for Aretha | Browsing works; little evidence of an active ranking community |
| Song detail | Respect loads, has an official YouTube link, zero votes, no rating history, and two completed zero-vote matchups | Implemented, but largely empty |
| Featured archive | No featured matchups | Empty editorial destination |
| Sign-in | Email form is enabled | Form rendering verified; email delivery and authenticated use not verified |
| Profile | Signed-out visitors redirect to sign-in | Public access guard works; authenticated screen reviewed in code |
| Admin | Signed-out visitors redirect with “Admin access required” | Public access guard works; editor functionality reviewed in code |
| Privacy | Storage disclosures and optional analytics control render | Present; no policy-compliance conclusion is made here |
| Health | Returns `{"status":"ready"}` | Database connectivity works; this does not establish product availability |

The initial narrow browser view and a 1440px desktop leaderboard were inspected. Artist filtering worked in the deployed interface, and the checked desktop leaderboard had no horizontal overflow. This was a spot check, not exhaustive device or accessibility certification.

## What is genuinely implemented

The current app uses Next.js, React, TypeScript, Supabase authentication and PostgreSQL. It has a coherent, relatively small architecture and meaningful server-side work:

- Transactional voting, duplicate-vote prevention, UTC eligibility, rating audit events and streak updates.
- Database row-level access rules for private profiles, votes and administrative data.
- Official-provider URL validation in application code and database constraints.
- Durable voting attempt limits across application instances.
- Leaderboard sorting/filtering/pagination, song details and rating histories.
- Editable profiles, paginated vote history and statistics with minimum-sample thresholds.
- Song editing/imports, future scheduling/replacement/cancellation, featured matchups, audit logs and ranking recovery.
- Optional aggregate analytics and a database connectivity endpoint.
- Unit, database and browser test suites, plus a GitHub verification workflow.

The database code accounts for concurrency and rolls vote updates back together. Imports preserve ratings and run atomically. These are valuable foundations, although their integration tests could not be rerun in this session.

## Must fix before public launch

### 1. The daily product is currently unavailable

- **What this is:** The editorial schedule supplies the one activity the site promises every day.
- **Problem:** Live Today has no matchup. The October 1 deployment record only scheduled October 1–11, which is consistent with an exhausted queue. The health endpoint still reports ready because it checks catalog connectivity only.
- **Fix:** Supply today's matchup and a meaningful future buffer, establish an editor responsible for replenishment, and monitor daily availability/queue coverage alongside database health. Give the empty page a useful route back to the catalog.
- **If we skip it:** Every “Play today” call to action ends at an unavailable activity, and a connectivity monitor will miss the failure.

Evidence: [Today](../app/today/page.tsx), [health endpoint](../app/api/health/route.ts), [deployment record](DEPLOYMENT.md), and the live Today/health pages.

### 2. Public sign-in and owner administration have no current launch sign-off

- **What this is:** An email magic link is required to vote and maintain a profile; an owner account is required to operate the schedule.
- **Problem:** The October 1 deployment record says custom SMTP was not configured, no production administrator was assigned, and hosted voting/persistence were unverified. I verified the live form and signed-out guards, but did not send mail or inspect current provider-dashboard settings, so these older settings must not be treated as freshly confirmed.
- **Fix:** Verify current SMTP and owner-role configuration, then complete a real hosted sign-in, vote, reload, profile and authorized-admin acceptance check.
- **If we skip it:** The site's main loop may remain inaccessible to ordinary visitors, and its editorial tools may have no working operator.

Evidence: [deployment record](DEPLOYMENT.md). Supabase's default email service is restricted and unsuitable for general public sign-in; see its [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

### 3. Preview deployments are documented as using the production database

- **What this is:** Preview deployments are where changes are normally exercised before release.
- **Problem:** The deployment record explicitly says Preview uses the production backend. If still configured that way, signing in, voting or testing admin changes in a preview affects real application data. The configured canonical auth redirect also goes to the production site.
- **Fix:** Verify the current deployment environment and give previews an isolated backend and matching redirects, or use read-only preview mode until that exists.
- **If we skip it:** A routine preview test can alter real votes, ratings or editorial content and give misleading test results.

Evidence: [deployment record, environment configuration](DEPLOYMENT.md). This is a documented configuration risk, not a dashboard setting reverified today.

### 4. Valid-looking profile names fail to save

- **What this is:** Profile editing accepts display names of up to 80 characters.
- **Problem:** The form, server action and latest RPC accept 80, but the profiles table still has a 60-character check constraint. A 61–80-character name passes the visible validation and fails at the database.
- **Fix:** Align all layers to one limit. Keeping the current 60-character database limit requires the smallest application change; add a boundary check covering 60 and 61 characters.
- **If we skip it:** Users receive a generic save failure for input the interface explicitly permits.

Evidence: [profile form](../app/profile/page.tsx), [server action](../app/actions.ts), [table constraint](../supabase/migrations/0002_daily_musicale.sql), [latest RPC](../supabase/migrations/0005_editorial_scheduling.sql). This finding is established by the mismatched code contracts; it was not executed against production.

## Should fix

### 5. The dependency audit currently fails

- **What this is:** The project locks `source-map-js` 1.2.1 through Next.js → PostCSS and runs `npm audit` in CI.
- **Problem:** Today's audit returned one high-severity advisory and exit code 1. The advisory concerns specially crafted indexed source maps blocking execution; I did not establish a public-input path to that parser in this app.
- **Fix:** Update the transitive lock entry to a compatible patched release, then rerun the audit and build. The advisory identifies 1.2.2 as patched.
- **If we skip it:** The known dependency issue remains, and the existing CI audit step fails if reached.

Evidence: [lockfile](../package-lock.json), [verification workflow](../.github/workflows/verify.yml), current `npm audit` output, and the [advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). This is not a demonstrated exploit of the deployed site.

### 6. The homepage presents an arbitrary starting order as community preference

- **What this is:** Home labels its first three leaderboard entries “The crowd's current top three.”
- **Problem:** Every live entry displays 1500. The query breaks equal ratings by song ID, so Nena, Stromae and Kendrick Lamar appear first because of that tie-breaking rule. The homepage does not check participation or explain the tie.
- **Fix:** Use an explicit early-launch/catalog state until there is enough voting evidence, and explain provisional or tied standings.
- **If we skip it:** Visitors see a ranking claim that the available evidence does not support.

Evidence: [homepage](../app/page.tsx), [leaderboard query](../lib/data.ts), and the live leaderboard.

### 7. Mobile removes information needed to understand ranking sorts

- **What this is:** Desktop leaderboard rows include record, total votes and win percentage.
- **Problem:** Below 760px, `.leader-row > span` is hidden. That removes this entire block even when the visitor sorts by total votes or win percentage. The narrow live view showed the song and rating without these values.
- **Fix:** Include those values in a compact mobile row or expandable detail instead of hiding them entirely.
- **If we skip it:** Mobile visitors can select a ranking criterion but cannot see the numbers that explain the order.

Evidence: [responsive CSS](../app/globals.css), [leaderboard markup](../app/leaderboard/page.tsx), and the narrow deployed leaderboard.

### 8. An open daily page does not handle midnight rollover

- **What this is:** The daily window ends at midnight UTC.
- **Problem:** The client receives `endsAt` but does not use it to refresh or expire its view. A tab left open overnight continues showing yesterday's matchup or result; an attempted old vote is correctly rejected by the server.
- **Fix:** Refresh when the daily window expires and recheck when a suspended tab becomes visible. Add a browser check spanning the boundary.
- **If we skip it:** Returning visitors can encounter stale content and an avoidable failed vote at the most important transition in a daily product.

Evidence: [daily client](../components/daily-matchup.tsx), [matchup data](../lib/data.ts), and server-side time checks in [migration 0003](../supabase/migrations/0003_daily_flow.sql). This is a code-traced case, not a live overnight test.

### 9. The starter queue cannot establish broad ranking evidence

- **What this is:** “Queue next ten days” reuses ten fixed editorial pairs.
- **Problem:** Those pairs contain twenty unique songs: each song has exactly one opponent in this queue. Reusing it repeats the same comparisons, without evidence connecting the ten separate pairs. This also limits discovery for returning listeners.
- **Fix:** Curate varied opponents and connections across the existing catalog. This can be done editorially with the existing scheduler; it does not require a new pairing engine.
- **If we skip it:** The global ranking remains based on narrow opponent coverage, while the daily content repeats quickly.

Evidence: [starter pairs](../data/editorial-pairs.json), [queue action](../app/actions.ts). This describes the bundled queue, not every matchup an editor could manually create.

## Nice to have

### 10. Shared results do not lead recipients back to the website

- **What this is:** Sharing is the MVP's built-in way to spread the daily activity.
- **Problem:** The copied result contains a matchup number, agreement percentage and streak, but no website URL. Native sharing also passes only this text.
- **Fix:** Add the canonical site link while retaining the spoiler-free format.
- **If we skip it:** Recipients must search for Musicale themselves, adding friction to the intended invitation loop.

Evidence: [share formatter](../lib/share.ts), [share controls](../components/daily-matchup.tsx).

## Why it feels unfinished

Your impression is supported by the current experience. The main daily action is missing, the archive is empty, and the ranking has starting values. The twenty-song starter catalog has no supplied artwork and only YouTube links, despite code support for additional providers. Song pages therefore have large letter placeholders and little accumulated history.

The typography, palette and navigation are consistent. The larger gap is a usable, populated daily experience: dependable content, working public entry, honest early-stage messaging and a satisfying result. External playback was an explicit MVP choice, but it requires visitors to leave Musicale, listen elsewhere and return. That friction should be tested with real users before assuming the daily habit works.

There is also little editorial explanation of why two recordings were paired or what to listen for. Adding a small amount of useful context would strengthen discovery more than adding several new modes. Artwork and richer metadata would help presentation once appropriate assets are available. These are product recommendations, not claims that embedded playback or artwork were mandatory launch features.

## Verification and limits

- Installed the existing locked dependencies; application source and dependency versions were not changed.
- `npm test`: all 17 named unit checks passed.
- `npm run build`: passed, including Next.js compilation and build-time type validation. This local build used preview mode because no local Supabase configuration was present.
- `npm run typecheck`: passed.
- `npm audit`: one high-severity transitive advisory; failed with exit code 1.
- Read current routes, components, helpers, current database migrations, seed generation, configuration, test suites and deployment/product documentation. Historical migration 0001 was inspected for context rather than treated as the current runtime.
- Inspected deployed public pages, signed-out profile/admin guards, health, narrow layouts and the desktop leaderboard/filter interaction.
- Database and authenticated browser suites were not rerun: Docker's Linux engine was not running. The existing tests cover transactions, access rules, concurrent votes, imports and a local magic-link flow, but their presence is not a current pass result.
- No production votes, emails, imports, roles or settings were changed. Current SMTP/admin/preview dashboard settings, regional music playback, manual screen-reader behavior, production load, backups and restore procedures were not independently verified.

## Completion order

1. Restore today's matchup and establish ongoing queue ownership and availability monitoring.
2. Verify public email delivery, owner administration and the full hosted voting loop.
3. Isolate previews and fix the profile-length mismatch and dependency advisory.
4. Correct early-launch ranking messaging, mobile ranking details and midnight rollover.
5. Improve opponent variety, populate the archive deliberately, add useful editorial context and finish sharing links.
6. Run the complete local verification suite and a small real-user beta before expanding scope.

An initial launch should be accepted only when an ordinary non-team visitor can sign in, hear both songs, vote exactly once, reload to the saved result, see consistent profile/ranking data and return to a new matchup on the next day. The owner must also be able to keep that loop supplied without modifying production SQL for routine editorial work.

**Verdict:** Keep the implementation, but treat Musicale as an unfinished launch. Restore the daily loop and prove real public use before calling the project complete.

**Not checked:** Authenticated hosted use, current provider-dashboard configuration, database/browser integration execution, regional playback, manual assistive technology and production load. The main risk is that a healthy deployment continues to conceal an unavailable daily product.
