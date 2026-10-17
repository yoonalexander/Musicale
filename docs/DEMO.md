# Musicale interview demo

The current public URL is https://musicale.alexyoon.com. Public release acceptance is pending: the October 16 read-only check found database health ready but Today unavailable. Use the verified local candidate to demonstrate implementation until the hosted gates pass.

Musicale offers repeatable higher-rated Play runs, continuous preference ranking, and one shared Daily matchup per UTC day. Guests can play and vote; an optional verified email account unlocks full history. Daily and Rank preferences update shared audited Elo, while Play points are separate. Four explicitly authorized recordings have custom 15-second previews; the original twenty songs keep official listening links. The owner manages imports, audio authorization and schedules. See [the guest experience](GUEST_EXPERIENCE.md), [audio coverage](AUDIO_PREVIEWS.md), and [current integration evidence](INTEGRATION.md).

## Local walkthrough

Use [README setup](../README.md#local-setup) for a fresh isolated backend. Automated fixtures write to their local database; run full verification in a disposable project rather than a database containing manual participation you want to preserve. The prepared Phase 7 session uses app **http://127.0.0.1:3200** and Mailpit **http://127.0.0.1:57324**, with the separate `musicale-phase6` backend. These URLs work on the Windows computer running the project, not a remote phone.

1. Open Home while signed out, press **Play**, and close the first-visit tutorial. Explain repeatable snapshot-graded runs and separate Play points. Open **Rank** to record preferences; **Listen and rank** selects songs with authorized previews. Listen, replay, and vote without leaving the page.
2. Open Daily. Explain midnight UTC, one daily preference per account and streaks; guest voting works. Optionally request a local sign-in email with a new address. Open the newest message in the local catcher and press **Confirm sign-in** to verify an email account. Existing guest activity is retained when upgrading to a new email; signing into an existing account loads that account’s history. No real inbox is needed locally.
3. Make a genuine listener choice. Both vote controls lock while pending; the saved pick, side totals, streak and next reset appear. Reload, inspect Profile, change its display name, and copy/share the canonical spoiler-free result.
4. Open Leaderboard in a second signed-out browser window. Submit a vote with another local account and observe actual push delivery without refreshing. Inspect mobile vote count/win rate/movement, filtering and song rating data.
5. For editorial tools, sign in locally as the prepared `phase7-owner@example.test` and use the local catcher. Import the disabled test entry from [Phase 5's owner checklist](PHASE_5.md#owner-test-import), edit it, schedule/replace/cancel a day forty-five days ahead, inspect the buffer/variety/audit, and restore any changed settings. Production owner credentials are never part of a public demo.
6. Show the named tests and run `npm run test:restore` after the browser suite has created vote/Auth records. Explain the difference between reconstructing derived rankings and restoring source rows/accounts from a private logical export. Show only aggregate pass results, never the dump or tokens.

## Architecture

```mermaid
flowchart LR
  U[Browser] --> A[Next.js server actions]
  A --> R[Authenticated PostgreSQL vote RPC]
  R --> V[Private votes, activity and audit events]
  R --> S[Public songs and rating snapshots]
  S --> L[Supabase songs-only Realtime]
  L --> C[Open leaderboard]
  C --> Q[Uncached public ranking read]
  Q --> S
  P[Aggregate readiness RPC] --> H[Readiness endpoint]
  H --> M[Prepared owner monitor]
```

PostgreSQL owns eligibility, uniqueness, Elo and streak updates in one transaction. The browser never calculates authoritative ratings. Public page loads retain tagged caching; live notification refresh uses the uncached authoritative path. Public cumulative values may permit inference about today's voting, while the direct daily-result RPC withholds counts until that account votes.

See [claim mapping](CLAIM_EVIDENCE.md), [Phase 3](PHASE_3.md), [Phase 4](PHASE_4.md), [Phase 5](PHASE_5.md) and [Phase 6](PHASE_6.md) for reproducible evidence and its limits. See [BETA.md](BETA.md) for the actual hosted acceptance record; an empty record is not a passed beta.
