# Phase 1 — Reproducible, isolated baseline

Completed October 15, 2026. Evidence for [roadmap Phase 1](ROADMAP.md#phase-1--establish-a-reproducible-isolated-baseline).

## Agreed decisions

- Preview deployments will be read-only, using the starter catalog with authentication and persistent voting disabled. Full integration testing will use the isolated local Supabase project. The owner accepted this approach during the Phase 1 interview.
- A separate cloud staging database is deferred. This does not make a preview an authenticated test environment.
- The roadmap's existing 60-character display-name limit remains the implementation target.
- Preview builds will reject either Supabase credential being attached. The owner confirmed this guard and authorized Phase 1 implementation in the interview.

## Verified starting facts

- Local branch is `main`, at `042a178621d16634229935f050d89b333eb8be3b`. The latest commit message contains `[skip ci]`.
- GitHub access works. The current commit has a successful Vercel deployment status; a passing application test workflow has not been established.
- Docker Desktop is installed, but its Linux engine was unavailable during the initial check.
- The project-local Supabase CLI is installed. No local `.vercel` or Supabase project linkage, or application environment file beyond `.env.example`, was found.
- Vercel was inspected on October 15: both Supabase variables were still in Production and Preview. Both are now saved as Production only. The Preview deployment filter showed no retained deployments. Production authentication/database settings remain the dated October 1 record; public email setup is Phase 2.

## Implementation scope

1. Inspect current hosted environment settings and remove backend access from previews.
2. Start the project-specific local backend without resetting existing data.
3. Recheck and fix the dependency advisory with the smallest compatible lockfile change.
4. Align form, server action and RPC display-name validation through a forward migration, with boundary checks.
5. Run the full baseline, resolve failures, and record command/CI/environment evidence.
6. Update the roadmap only for checks supported by completed evidence.

Phase 2 production authentication setup and hosted application migrations are outside this phase. No production data reset is part of this work.

## Evidence

- Docker Desktop Linux engine started; `npm run local:start` applied migrations `0001`–`0007` and seed to the isolated Musicale stack. No reset was run. API/database/email ports are 55321/55322/55324.
- `source-map-js` updated from 1.2.1 to 1.2.2 with no other dependency versions changed. `npm audit` reports **0 vulnerabilities**.
- Unit checks: **18 passed**, including preview configuration with neither, either and both credentials, plus production/development controls. Error messages do not disclose the supplied test key.
- Database checks: **22 passed**, including actual 60-character acceptance, 61/null/empty/control-character rejection and preservation of the last valid name. A repeat run exposed an existing minute-rollover assumption in the rate-limit test; its batch now uses a stable transaction time and checks committed attempt counts afterward.
- Production build passed with local backend settings; an explicit tracing root resolves the workspace-root warning.
- The first browser run could not launch because Playwright's required binaries were missing. Chromium and WebKit were installed from Playwright's official distribution. The subsequent full `npm run verify` exited successfully: **18 unit checks, 22 database checks, production build, 9 browser tests and TypeScript**. The corrected database test was then rerun separately: **22 passed**.
- Browser verification passed on Chromium desktop/mobile and WebKit, including magic-link authentication, saved voting, 60-character profile edits, narrow layouts and automated accessibility checks. Linux CI also passed Firefox; Windows Firefox remains outside the documented default matrix.
- Implementation commit: `52c911f31ca3ef0d3013a60455b287d19913686d`, branch `codex/phase-1-baseline`, [draft PR #1](https://github.com/yoonalexander/musicale/pull/1).
- [Vercel preview deployment](https://vercel.com/yoonalexanders-projects/musicale/aCG3gpdkTQak7KjrwuXyFT2FHSLR) is Ready for that implementation commit. A live Chrome smoke check confirmed the preview notice on Home, Login and Today, disabled magic-link submission and both disabled vote buttons. [Read-only preview](https://musicale-9b0px47lb-yoonalexanders-projects.vercel.app).
- Vercel variable scope changes were saved successfully. No credential rotation or hosted database migration was performed. Apply `0007` through the normal hosted upgrade process before promoting the new application to Production.

## Clean-checkout CI gate

[GitHub Actions verification](https://github.com/yoonalexander/musicale/actions/runs/38781870552) **passed** against implementation commit `52c911f31ca3ef0d3013a60455b287d19913686d`: locked install, browser engine installation, local Supabase startup, **18 unit checks, 22 database checks, production build, 12 browser tests, TypeScript and zero audit vulnerabilities**. The workflow uses a clean checkout and retains browser traces on failure. It stopped its disposable backend successfully afterward.

All Phase 1 acceptance gates passed. Later documentation-only commits record this evidence without changing the tested application. Production SMTP, administrator setup, matchup scheduling and authenticated hosted smoke checks remain Phase 2. Apply migration `0007` before promoting this application change to Production; the PR remains a draft for review.
