# Phase 5 — Consumer and editorial experience

Started October 16, 2026 on `phase-5-product-experience`, from Phase 4 commit `db787161400413137ffca9a3b230cb66d564916e`, in a separate managed worktree.

Status: **implementation and local automated checks complete; CI and human acceptance pending**. The owner has agreed to perform the checks below. No human acceptance result is recorded yet. Production and the Phase 2 hosted sign-in investigation are unchanged. There is no new SQL migration in this phase.

## Implemented behavior

- Home explains official-provider listening, email sign-in, one permanent vote per UTC day, streak reset, Elo and provisional/tied initial rankings. Unplayed songs do not receive an implied community rank.
- Both voting controls share one form pending state. A new successful vote focuses the result heading, announces its saved choice, shows both totals and the next UTC reset. Reload retains the saved choice. Shared/copied results contain the configured canonical `/today` URL without song spoilers; clipboard denial retains selectable text.
- Narrow leaderboard rows retain vote counts, win percentage, Elo and weekly movement. Filters, all four sorts, empty states and 25-row pagination are covered with sixty generated local songs.
- Profiles link saved choices to song pages. Browser fixtures cover empty history, four/five-vote insight thresholds, twenty-six votes across two pages, streaks and completed-matchup presentation. Real-vote coverage checks accessible rating data against the stored snapshot. Synthetic historical UI fixtures are not database consistency evidence; the separate database suite covers consistency.
- The thirty-pair starter plan has no repeated unordered pair, twenty songs, three opponents per song and one connected graph. Admin reports variety and coverage for the actual next thirty days, preserving existing scheduled days rather than silently replacing them.
- Admin has shared pending feedback, readable song names, and CSV/JSON paste/file import labels. Browser coverage combines editing/import, availability, future replacement, cancellation, featuring, K-factor, audit and recovery workflows.
- Help/contact, titles/descriptions, root share metadata, missing-song/404 and safe service-failure recovery are present. Retry performs a fresh GET. A database-fault test restores the local view and waits for PostgREST schema readiness before retrying.
- Skip navigation, focus outlines, keyboard voting, labels, error messages, mobile metrics and existing reduced-motion behavior remain accessible. Automated axe results are useful evidence but do not replace the manual screen-reader check.

## Evidence and verification

Passed so far: **22 unit checks, 45 database cases, production build, TypeScript, full dependency audit (zero vulnerabilities), source formatting and patch whitespace checks**. The Windows browser matrix initially passed 45 of 48 cases. All three remaining cases then passed targeted reruns after fixes: the desktop editorial transition, WebKit onboarding/skip-link activation, and WebKit full daily flow. This is combined case coverage, not a claim that the initial full run was green. Linux/Firefox clean-checkout CI is pending. Focused runs corrected shared pending-state behavior, fresh-GET service retry, explicit skip-link tab position for WebKit, unique local fixture labels and completed editorial form transitions. The full daily-flow allowance is now 150 seconds; its final WebKit rerun took 46.7 seconds. Failed or interrupted runs are not acceptance evidence.

Named coverage lives in `tests/browser/daily-flow.spec.ts`, `product-experience.spec.ts` and `live-rankings.spec.ts`. The product suite covers onboarding/metadata/404, both pending vote controls, sixty-song filtering/sorts/pagination, profile/archive thresholds, editorial imports/replacement/audit, and controlled database-read recovery. Public routes are checked at 320px, a typical phone width and desktop; populated profile/Admin checks use 320/390/1280px. Retained local screenshots use `output/<project>-phase5-*.png`; traces remain ignored locally and may contain test authentication state.

[Catalog verification](CATALOG_VERIFICATION.md) records twenty successful provider metadata reads, channel/title review and release-year sources. Letter artwork is intentional. Provider metadata is not proof of regional audio playback or image rights. The archive intentionally remains empty until actual completed participation is featured; synthetic local UI fixtures never become production content.

## Reproduce locally

From this worktree with Docker Desktop's Linux engine running:

```powershell
npm ci
New-Item -ItemType Directory -Force tmp/phase5-local/supabase | Out-Null
Copy-Item supabase/migrations tmp/phase5-local/supabase -Recurse -Force
Copy-Item supabase/seed.sql tmp/phase5-local/supabase/seed.sql -Force
$phase5Config = (Get-Content supabase/config.toml -Raw).Replace('project_id = "musicale"', 'project_id = "musicale-phase5"').Replace('553', '573')
Set-Content tmp/phase5-local/supabase/config.toml $phase5Config
$env:MUSICALE_LOCAL_WORKDIR = 'tmp/phase5-local'
npx supabase start --workdir $env:MUSICALE_LOCAL_WORKDIR
npm run verify
npm audit
npx supabase stop --workdir $env:MUSICALE_LOCAL_WORKDIR
Remove-Item Env:MUSICALE_LOCAL_WORKDIR
```

Phase 5 uses API 57321, PostgreSQL 57322, Mailpit 57324 and the test app on 3200, avoiding other active worktree services. Do not run another stack on these ports. The ordinary development server remains on 3000. Browser and database helpers refuse hosted backends. Windows omits Firefox unless explicitly enabled; Linux CI includes Firefox. Stopping this local stack preserves data.

## Human acceptance — pending

The agent will leave a stable local build running at **http://127.0.0.1:3200** after automation. Local sign-in messages appear at **http://127.0.0.1:57324**, rather than in a real inbox. Use the same browser for requesting and following the link. These addresses work on the Windows computer running this worktree; they are not public phone URLs.

1. **New visitor:** give someone unfamiliar with Musicale only the Home URL. Ask them to use it, without explaining the flow. They should discover listening, sign-in, voting, saved results and tomorrow's reset. Afterwards record what they understood, whether they completed it, and any confusion. A local address such as `phase5-visitor@example.test` is sufficient; explain only where the local mail catcher is.
2. **Owner/editorial session:** sign in as the prepared local `phase5-owner@example.test`, follow its local message, then open `/admin`. Import a disabled test song; edit it; change availability; schedule and replace a day at least forty-five days ahead; cancel it; toggle today's feature flag (it should only appear in the archive after voting closes); change and restore K; review audit and recovery feedback. Use the interface throughout. If genuine completed local content is absent, the archive should remain empty. Automated tests cover completed historical presentation with a controlled local fixture.
3. **Screen reader:** use Windows Narrator (`Win+Ctrl+Enter`) or your usual screen reader. With a fresh local account, navigate and submit email using the keyboard; follow the local link; inspect both song/provider labels; vote; confirm pending feedback, saved-choice/results announcement, reset policy and share controls. Also retry an invalid/used sign-in link and check its feedback. Record screen reader/browser names, completion and confusing/missing announcements.
4. **Device and provider spot check:** inspect Today, Leaderboard, Profile and Admin at a narrow window and desktop. Open scheduled songs' official links in your region; confirm the intended recordings play. Report blocked controls, overflow or inaccessible values.

Report each check as pass/fail/not tested with browser, screen reader and observed issues. Account identities, tokens and screenshots of private inboxes do not belong in the public evidence. Phase 5's new-visitor, owner and manual accessibility gates remain open until real results arrive.

### Owner test import

In Admin, open bulk import, choose JSON, and paste this disabled test entry. Click Save catalog. Then select it in the individual song editor, change its title and save; use Manage song availability to switch it to Unavailable. This fictional record cannot enter an active listening matchup.

```json
[
  {
    "id": "phase5-owner-check",
    "title": "Owner check",
    "artistName": "Local test",
    "albumName": "Single",
    "releaseYear": 2026,
    "status": "disabled",
    "providers": []
  }
]
```

For scheduling, choose a day at least forty-five days ahead (for an October 16 test, November 30, 2026). Save two existing playable songs, choose that date in Replace upcoming matchup, change one song and save, then cancel that date in the scheduled list. Record the visible confirmations and audit entries. Set K to 25, save, then restore 24. Recovery should report the number of recorded votes after explicit confirmation. All of this affects only the local Phase 5 stack.
