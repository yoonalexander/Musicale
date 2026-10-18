# YouTube production publication — October 17, 2026

The current-product YouTube integration is merged into remote `main` at
`51c395d7556a4a30676a77f271f8fc9fee22d513` and live at
[musicale.alexyoon.com](https://musicale.alexyoon.com).
[Vercel deployment 46UB2eUS58m5qFYmMsPDvY6qjQGo](https://vercel.com/yoonalexanders-projects/musicale/46UB2eUS58m5qFYmMsPDvY6qjQGo)
reports success. The newer green welcome and Play, Rank and Daily are preserved.
The owner explicitly authorized publication and confirmed saving `YOUTUBE_API_KEY`
in Vercel Production. The key remains server-side.

## Production changes

- Inspected the hosted migration history before changes: exactly canonical
  `0001`–`0016`. Applied the additive analytics migration before deploying the
  client. Supabase assigned `20261018001728_youtube_playback_events`; the local
  filename now matches that applied version. No existing hosted migration was
  relabeled or reapplied.
- Independently verified the new constraint/function support the YouTube events,
  preserve legacy event mapping, deny execution to `anon` and permit the existing
  authenticated entry point. Realtime still publishes only `public.songs`.
- Inspected the existing Superstition provider row, then changed only its known
  old YouTube identity/URL from `egqv1mtos6A` to reviewed `ftdZ363R9kQ`. The update
  guarded the exact old association and asserted complete song rows and Rank
  votes remained byte-equivalent within the transaction. No seed/reset was used.
- Verified 24 songs and 20 YouTube sources. The two genuine Rank votes already
  present before publication were preserved; Daily had zero votes. Smoke checks
  cast no preferences or guesses and therefore did not fabricate ratings.
- The security advisor reports no ERROR findings. Existing warnings include
  the mutable `set_updated_at` search path, intentionally exposed/authorized
  RPCs and guest policies, and disabled leaked-password protection. These were
  not introduced or reconfigured by the YouTube migration. See
  [search-path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).

## Live verification

Verification targets the canonical HTTPS application, without metadata or
player mocks. It confirms fresh normal and Made for Kids metadata for Dynamite,
99 Luftballons and Superstition, including the replacement identity. The
configured key is absent from those HTML responses.

Native player gestures reach YouTube `PLAYING` for Dynamite and Superstition.
No iframe is loaded before the explicit Load button; unloading removes it.
`PLAYING` can include an advertisement and does not establish audible music or
full-song completion.

Home, Play, Rank, Daily, Leaderboard, health and readiness return HTTP 200.
Daily renders its two YouTube controls. Guest Rank can issue a pair containing
YouTube and/or the existing licensed audio. Guest Play issues an eligible rated
pair; at this check that pair uses the licensed recordings. Play still requires
genuine accepted preferences and untied ratings. No eligibility or scoring rule
was changed to populate commercial songs artificially.

The browser checks create guest identities and pending comparisons or
zero-score Play runs. They do not submit votes/answers. Private session tokens
are not exported. Credential-free diagnostic output and screenshots remain
under ignored `output/youtube-production-*`; the runner/log are under ignored
`tmp/youtube-production-*`.

The final local unit/API suite passes 43 checks and TypeScript passes. Full
database/browser/restore evidence for the same runtime implementation is in
[the integration report](YOUTUBE_PLAYBACK.md). The
[new main CI run](https://github.com/yoonalexander/musicale/actions/runs/39082294094)
was still running at publication and is not claimed green. The earlier main
run failed its WebKit offline Realtime server-subscription cleanup assertion
(seven rows remaining after 45 seconds; 123 other browser cases passed).
That inherited failure is separate from the successful native production
YouTube playback checks.

## Remaining acceptance

Physical iOS/Safari and Android playback, real email/account upgrades,
multi-browser production voting/Realtime, owner administration, operational
alerts/recovery and the genuine beta remain open. No synthetic production
votes were added to close those gates. See [earlier rollout boundaries](PRODUCTION_2026_10_17.md)
and [the release checklist](PHASE_7.md).
