# Game-first Musicale and guest access

October 16, 2026. Branch `game-first-guest-play`, based on completed Phase 5B `825679d`. Implemented and locally verified. Production has not been changed.

## Product direction

The owner requested the entry pattern shown in the supplied Wordle screenshots: a focused welcome screen, a primary Play action, then a first-visit How to play dialog over the actual game. Musicale keeps its own music identity, sage/ivory palette, typography, icon and tutorial examples. No Wordle assets or advertising/subscription flows were copied.

The owner explicitly chose **repeatable Play runs**, rather than a shared once-per-day scored challenge. “Daily” remains the separate shared preference vote. Play leads the home screen; Rank and the leaderboard remain directly reachable. The tutorial opens once per browser, can be reopened from the game, supports Escape and keyboard focus wrapping, and restores focus after closing. Both song cards stay side by side on small screens. Play, Rank and Daily use the same compact card layout.

Play rules remain those validated in Phase 5B: private server-issued rating snapshots, exactly-once points, one randomly replaced card after a correct guess, wrong guesses ending the run, preserved points on expiry/unavailability, and no Play effects on Elo or Daily participation. No database schema or historical migration was changed for guest access.

## Guest behavior and account boundaries

Opening public pages creates no player identity. Clicking Play, getting a Rank pair, or submitting the first Daily vote can create a private Supabase anonymous session directly from the browser. There is no email or registration screen. Existing sessions are reused. The browser handles the initial auth request, preserving the provider's client-IP rate limiting. React form pending states cover session creation as well as the subsequent server action; a provider failure leaves an honest retry message.

Anonymous sessions use the existing authenticated PostgreSQL role and `auth.uid()` ownership checks. They do not give the public `anon` API role permission to write tables. Scoring/vote transactions, request budgets, private answer projections and RLS remain unchanged. Guest metadata cannot assign an administrator role. Raw Play tables remain unreadable even by their owner. Public Realtime still publishes only songs.

Profile/history UI and display-name editing require a verified email account. Guests see an optional Sign in link, not a gameplay gate. Current run state remains visible to its guest owner; private own activity is retained by the backend. The profile route does not expose a guest's full history UI. Database ownership protection remains the security boundary; this is not a claim that guests cannot query their own permitted data through the API.

A new email is linked to the existing guest identity, and verification refreshes that same session. Its votes and runs keep their original owner ID. The installed auth client clears a newly generated PKCE verifier while saving an email-update session, so the guest verification return has a separate, narrow endpoint. It validates the already-owned session against the auth provider, requires a confirmed email and non-anonymous user, and refreshes claims without accepting a URL-supplied identity or swapping accounts. The existing magic-link callback remains unchanged; this does not resolve or claim to resolve the Phase 2 hosted sign-in issue.

If an email already belongs to an account, the established sign-in flow loads that account. Guest activity is **not silently merged**. Login explains this distinction. Guest records are retained so the ranking audit/recovery source is not destroyed. Clearing cookies, signing out or switching browsers loses access to an unlinked guest session. A guest is a browser credential, not a verified unique human; Daily's uniqueness constraint remains per player identity per UTC day.

## Local setup and hosted requirements

Local `supabase/config.toml` enables anonymous sign-ins and manual identity linking, and allowlists `/api/auth/guest-confirm` alongside the existing callback on the development/test origins. The local anonymous signup limit is 200 per IP per hour to accommodate browser projects sharing one test IP; this is **not** a production rate-limit recommendation.

Before a future hosted rollout:

- Enable anonymous sign-ins and manual identity linking in that environment, and add the exact canonical `/api/auth/guest-confirm` redirect. Retain the existing callback allowlist and email confirmation.
- Review provider signup limits and bot protection for public anonymous access. Supabase documents a default IP-based anonymous signup limit and recommends CAPTCHA/Turnstile. Any enabled challenge must be integrated and tested with the applicable signup/email flows; no production CAPTCHA configuration was changed here.
- Keep per-player Play/Rank/Daily budgets and RLS enabled. Cookie clearing can create another identity; do not present this as a one-vote-per-real-person guarantee.
- Extend operational monitoring, backup/restore and capacity checks to anonymous identities. **Do not run generic anonymous-user deletion cleanup:** this schema cascades account deletion into preference/audit source data. Retain those identities or design and verify an archival/anonymization workflow before deletion.
- Complete hosted sign-in and real-device/release acceptance in the existing Phase 2/6/7 work. Local tests are not hosted acceptance.

Provider references checked for this implementation: [anonymous sessions, linking and abuse prevention](https://supabase.com/docs/guides/auth/auth-anonymous), [local auth configuration](https://supabase.com/docs/guides/local-development/cli/config), and the [Supabase changelog](https://supabase.com/changelog). Existing private pages remain dynamically rendered through the cookie-aware layout; public leaderboard reads retain the established caching boundary.

## Verification

`tests/browser/guest-play.spec.ts` exercises welcome/no identity on GET, immediate Play entry, first-visit/reopened tutorial, keyboard focus/Escape, side-by-side responsive cards, axe checks, guest scoring/resumption, optional profile access, Rank and Daily participation, verified new-email history preservation, existing-account sign-in without merging, signup outage/retry, raw-table/other-run/admin denial and user-metadata role injection. Existing Play, Rank, Daily, onboarding and auth regressions were updated for the approved guest behavior. The shared accepted-preference fixture is reused rather than duplicating song/rating setup.

Runtime implementation: `ff648d223b7c33fd4ac333e0b919cb4310021fef`. Verification uses the isolated `musicale-play` backend on port 59321; no hosted account, vote or configuration was changed.

| Check | Result |
| --- | --- |
| Unit suite | 26 passed |
| Production build and TypeScript | Passed |
| Dependency audit | 0 vulnerabilities |
| Selected existing and guest browser regressions | 59 passed; one mobile layout failure identified and fixed |
| Final guest regressions after the mobile fix | 15 passed: 5 each in desktop Chromium, WebKit and mobile Chromium |
| Clean-checkout CI | Queued at the time of this record; see [PR 12 checks](https://github.com/yoonalexander/musicale/pull/12/checks) for the latest run. No green CI claim |

The mobile failure came from the inherited static VS badge occupying a grid cell. The fix explicitly positions it over the cards and adds a same-row assertion. The final tutorial also keeps its close and Play controls visible while its instructions scroll on small screens. These assertions passed in all three local browser projects. The selected regression run was not the full browser suite; the final 15-case run rechecks all new guest scenarios after the layout fix. Firefox and the full database/browser regression suite remain pending in CI, rather than being inferred from Phase 5B's previous green run.

Recorded screenshots, visually inspected using synthetic local activity:

- Desktop: [welcome](evidence/guest-experience/desktop-guest-welcome.png), [tutorial](evidence/guest-experience/desktop-guest-tutorial.png), [Play](evidence/guest-experience/desktop-guest-play.png).
- Mobile: [welcome](evidence/guest-experience/mobile-guest-welcome.png), [tutorial](evidence/guest-experience/mobile-guest-tutorial.png), [Play](evidence/guest-experience/mobile-guest-play.png).

The local preview is available at `http://127.0.0.1:3100` while its server is running. Local sign-in messages go to the mail viewer at `http://127.0.0.1:59324`, not the real inbox. Home, `/api/health` and the mail viewer returned HTTP 200 after restarting only this isolated backend with the updated configuration. Physical-device and hosted acceptance remain open.
