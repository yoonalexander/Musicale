# Musicale: Play, Rank and Daily

Product direction recorded October 16, 2026. The owner described the Play and Rank loops and confirmed that Daily remains a third mode. Rank implementation and its verification boundary are recorded in [Phase 5A](PHASE_5A.md). Play implementation and verification are recorded in [Phase 5B](PHASE_5B.md); the full hosted release is pending.

## October 16 guest-first revision

The owner approved a Wordle-inspired welcome → Play → first-visit tutorial flow and guest access to Play, Rank and Daily. They explicitly retained repeatable Play runs; the main game is not a shared once-per-day challenge. Optional email accounts add the full history/profile interface. A verified new email retains its guest identity; existing accounts load their own history without merging guest activity. This supersedes the earlier signed-in-only first-version default below. See [implementation and rollout boundaries](GUEST_EXPERIENCE.md).

## Purpose and current implementation

Musicale lets listeners build a community music ranking and play a guessing game using that ranking. Daily adds a shared comparison and a reason to return each day.

The current implementation supports continuous Rank, Daily, accounts, separate preference histories, Daily streaks, shared Elo rankings/recovery, administration and reviewed catalog discovery. Play adds private persisted runs, snapshot grading and independent points. Reuse the catalog, authentication, authorization, Elo calculation, audit/recovery infrastructure, listening controls and live leaderboard.

| Mode  | Question                                  | Progression                                                                             | Effect on song Elo                                     |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Play  | Which song has the higher Elo rating?     | Correct answer earns one point; randomly replace either card with a new song and repeat | None                                                   |
| Rank  | Which song do you prefer?                 | Record the choice, show two new songs and repeat without a daily voting quota           | Chosen song gains Elo; the other loses the same amount |
| Daily | Which of today's two songs do you prefer? | One shared editorial pair per UTC day; reveal results after the account votes           | Same Elo system as Rank                                |

Navigation is Play (`/play`), Rank (`/rank`), Daily (`/today`), Leaderboard and Profile. Keep `/today` working so existing links continue to resolve. Do not advertise working Play or Rank routes before their acceptance checks pass.

## Play contract

- Begin a run at zero points with two distinct eligible songs. Ask which has the higher Elo, rather than which is the player's favorite. A better leaderboard position means a lower numerical rank; use Elo to make the question unambiguous.
- The server captures both ratings when issuing each round and grades against that snapshot. Concurrent preference votes cannot change an outstanding round's correct answer. Reveal the captured ratings after the guess.
- A correct answer adds exactly one point. Randomly choose either card for replacement, independently of which song was selected or higher rated. The replacement differs from both songs in the previous round; the other song stays.
- Capture a fresh rating snapshot for the next round, including the retained song. Do not offer a tied pair or treat an equal rating as a correct/incorrect guess.
- Issue and consume rounds on the server. Repeated submissions, double clicks and concurrent requests cannot award extra points, reroll a pending pair or advance twice. Clients never supply authoritative points or correct answers.
- Play never writes preference votes, rating events, song Elo or Daily participation/streaks. Public song ratings remain browsable elsewhere; server grading is not a claim that looking up the answer is impossible.

Implemented first-version defaults: an incorrect guess ends the run; persisted runs use the existing signed-in account; eligible songs have at least one accepted Daily or Rank comparison. These are defaults, distinct from the owner's explicitly confirmed three-mode decision. Guest play and a competitive game-score leaderboard are outside the initial scope.

Play rounds expire after thirty minutes, and mutations share a separate thirty-attempt per-account per UTC-minute budget. Expired/unavailable rounds resume with the same songs and fresh snapshots; pending valid rounds cannot be rerolled. A paused run may be explicitly ended and restarted at zero.

If there are too few eligible songs or no distinct untied replacement, show an honest unavailable/paused state and a route to Rank. Preserve earned points; insufficient data, an expired round or a service error is not an incorrect guess. Do not fabricate ratings or silently replace both cards.

## Rank contract

- Use authenticated accounts and server-issued pairs of distinct, active songs with usable listening sources. MusicBrainz metadata links alone do not provide playback. Reuse authorized previews and official external-link fallbacks.
- Ask for preference, with no correct answer and no game points. Hide the ratings in this choice interface until submission to reduce suggestion from the displayed scores; aggregate ratings remain public elsewhere.
- After a successful choice, replace both songs. Exclude both previous songs from the next pair. A continuously playable pool therefore needs at least four eligible songs; explain insufficient availability without inventing content.
- Allow further pairs without a daily quota. A finite catalog can produce repeated comparisons over time. Rate limits and a documented, time-bounded repeat-pair cooldown protect integrity without imposing a permanent one-vote-per-pair limit.
- The server records an issued comparison only once. Refreshing/retrying returns the saved result or the pending pair. Validate ownership, pair membership, song availability and expiry at submission; do not trust browser-supplied opponents or ratings.
- Atomically record the preference, both Elo/counter changes and the rating audit event. Calculate from current locked song ratings and record the applicable K-factor. A failed vote leaves all business records unchanged while retaining the request attempt under the established budget pattern.
- Rank uses a ten-minute repeat-pair cooldown, thirty-minute expiry and thirty attempts per account per UTC minute. Keep Rank request budgets separate from Daily so a Rank limit cannot consume the account's Daily allowance.

Rank contributes to cumulative song comparison counts and rating history. Keep Rank history/counts identifiable in Profile; Daily vote totals, daily activity and UTC streaks retain their existing meaning. Do not turn multiple Rank votes into multiple days of participation.

## Shared ratings and historical data

Daily and Rank use one song identity and one Elo leaderboard. Play consumes those ratings without influencing them.

Extend the existing database with forward migrations. Preserve existing song IDs, provider associations, curated metadata, Daily matchups/votes, accounts, streaks, rating events and source attribution. The catalog addition owns migration 0010; reconcile other active branches before allocating subsequent migration versions.

Both voting modes must use compatible song-lock ordering and a deterministic rating-event order. Recovery must replay their combined events in the actual rating-update order, retaining recorded historical K-factors and before/after values. Existing Daily-only recovery evidence does not prove the new mixed workflow. Refuse inconsistent source history without partial recovery writes.

Retain Daily's existing uniqueness constraints. Give Rank its own issued-comparison uniqueness; do not remove Daily safeguards to permit continuous voting. Keep private votes, runs, issued rounds and correct-answer snapshots protected by RLS and outside public Realtime payloads. Publish only the established public ranking information.

The previous legacy game records remain private historical data. Their existence is not an implementation of this new Play contract and does not justify restoring obsolete public APIs.

## Delivery and acceptance

The [roadmap](ROADMAP.md) adds Phase 5A for Rank and Phase 5B for Play. Existing consumer/admin work in Phase 5 remains useful; completing it does not complete these new modes. Hosted sign-in remains the separate Phase 2 issue, and local development must not change production.

1. Finish Rank's transactions, issuance, history and mixed Daily/Rank recovery tests first. Prove duplicate races, rollback, authorization, budgets, cooldowns, song eligibility and cross-browser live rankings.
2. Build Play against the resulting ratings. Prove server-side scoring, snapshot grading during concurrent votes, exactly one random card replacement, ties, insufficient data, run persistence and zero Elo/Daily side effects.
3. Connect the three modes through onboarding, navigation and Profile. Exercise mobile, keyboard, accessibility, loading, empty and failure states with the existing browser stack.
4. Extend operations and release checks to both new modes. Use synthetic votes only in isolated tests and legitimate participation for hosted evidence.

Résumé wording must scope “one vote per user per day” to **Daily**. Rank is continuous and has different uniqueness guarantees. Play points are separate from song Elo. New functionality is a release requirement, not a completed claim, until its implementation and acceptance evidence exist.
