# Fifteen-second music previews

October 16, 2026. Branch `audio-preview-player`, based on `game-first-guest-play`. Production has not been changed. The feature uses real licensed recordings; commercial catalog coverage is explicitly separate from player completion.

## What visitors get

The shared listening component provides a custom player on **Play, Rank, Daily and individual song pages** whenever a song has an available, authorized audio source. It includes play/pause/replay, a keyboard-operable seek bar, elapsed/remaining time, loading/buffering/error/retry states, visible credits and license/source links. Starting another song pauses the previous player. Changing a pair/page tears down its media element and audio graph; hiding the page also pauses playback. There is no autoplay or audio preload.

Each replay has a maximum 15-second audible budget and a source window of at most 15 seconds. Pausing and buffering consume no budget; seeking backward cannot renew it. Seeking forward cannot reach outside the window. Replay explicitly starts a new budget. Playback rate is fixed at one. A Web Audio gain envelope closes on the audio clock at the deadline; timers/animation frames update the UI and pause the media element. This avoids depending on a delayed `timeupdate` event to limit audible output. MP3 padding can make the encoded asset's reported duration slightly longer than 15 seconds; the player gates at 15 rather than trusting the encoded duration.

**Rank → Listen and rank** issues comparisons containing only authorized previews using the existing private comparison and vote transactions. Switching back to all songs is explicit. Existing four-song eligibility, distinct next pairs, ten-minute pair cooldown, thirty-minute expiry, account request budgets, audit/replay and Elo calculations remain. With the small four-recording preview pool, a player can exhaust fresh pairs temporarily; Get a pair returns to the broader catalog. Preview presence is not used as a new voting or rating signal.

## Provider decision and actual coverage

| Candidate                         | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iTunes Search / Apple previews    | Not enabled for gameplay. Apple's [published Search API terms](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) limit promotional assets to promoting store content, rather than entertainment. A working preview URL is not permission. MusicKit is not treated as a substitute standalone-game license.                                                                                 |
| Deezer                            | Not enabled. Its [developer terms](https://cdn-content.dzcdn.net/pdf/CGU-developers.pdf) describe application approval and use restrictions. Musicale has no documented approval for a standalone custom-player game.                                                                                                                                                                                                                     |
| Jamendo                           | Evaluated, not enabled. Its [API terms](https://devportal.jamendo.com/api_terms_of_use) require appropriate content-license compliance and restrict free API use to noncommercial applications. It introduces account/access and use-scope decisions unnecessary for this demonstration.                                                                                                                                                  |
| Wikimedia Commons / Kevin MacLeod | Selected for four exact recordings with explicitly documented **CC BY 3.0** permissions, performer attribution, ISRCs and stable file identifiers. [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) and the [license](https://creativecommons.org/licenses/by/3.0/) permit redistribution with attribution and change disclosure. This permission applies to these recordings only. |

Wikimedia's binary host returned intermittent HTTP 429 during availability probes. Musicale therefore distributes four **authorized, attributed 15-second excerpts** as application assets, rather than depending on live third-party audio delivery. This is an explicitly licensed exception to the earlier no-rehosting default. No commercial recording was copied, proxied, cached or relabeled as authorized. Audio playback itself requires no API key, subscription or third-party audio request.

The original **20 commercial catalog songs have 0 authorized previews**. Four additional, clearly identified recordings provide the complete playable alternative:

| Recording                 | Performer     | ISRC         | Source excerpt |
| ------------------------- | ------------- | ------------ | -------------- |
| Gymnopedie No. 1          | Kevin MacLeod | USUAN1100787 | 20–35 seconds  |
| Gymnopedie No. 2          | Kevin MacLeod | USUAN1100786 | 15–30 seconds  |
| Gymnopedie No. 3          | Kevin MacLeod | USUAN1100785 | 15–30 seconds  |
| Hall of the Mountain King | Kevin MacLeod | USUAN1200072 | 40–55 seconds  |

The compositions are by Erik Satie and Edvard Grieg; the selected recordings are MacLeod's performances/arrangements, not another artist's rendition. Starting points are editorial choices within the authorized originals, not a claim about an automatic chorus detector. Public [credits](../public/audio/CREDITS.md), the Help page and individual players retain authorship, permission links, license links and trimming/re-encoding disclosure. No artist endorsement is implied. Audio licenses remain independent of the application-code license; the player is not DRM.

`data/audio-provenance.json` records source and asset hashes, provider file identity, ISRC, source/permission URLs and changes. `data/authorized-recordings.json` is the small reviewed discovery catalog. The application does **not** silently approve arbitrary Commons search results or every CC-labeled upload.

## Catalog and administration

The existing table is named **`song_audio_sources`**, rather than `audio_sources`. Migration `0014` extends it with recording identity, snippet offset, license URL, sync time and automatic-management state. Its one-source-per-song key remains, and a unique provider/recording index prevents attaching one recording to multiple songs. Only available, authorized sources are public under the existing RLS; reviewer/management data remains private. A tightly constrained local `/audio/*.mp3` path is supported alongside HTTPS URLs. `0015` allows authorized audio-only songs in Daily scheduling, reads and voting, preserving the immutable-day rules and transactional vote logic.

Discovery uses exact MusicBrainz recording IDs where verified, ISRC matches, then conservative normalized title/performer/year/duration matching. A different performer, live/remix title, conflicting ISRC or duplicate metadata match is not silently associated. Wikimedia's metadata API revalidates file identity, checksum, author, media type and license before attaching the reviewed local asset. Provider outages or changed evidence leave existing sources intact and return a retry/review message. Matching is limited to the reviewed four-recording catalog; expanding coverage requires reviewing additional exact recordings and generating their authorized assets.

All three import paths—individual song save, JSON/CSV batch import and MusicBrainz discovery import—attempt authorized-preview association after a successful catalog transaction. A provider failure does not undo a successful catalog save. Admin → Audio also offers **Discover authorized previews** and **Import four open-license recordings**. Repeat imports preserve existing songs and edits. Automatic refresh preserves manually managed, rejected and unavailable sources; it does not overwrite an editor's decision. No fake votes, Elo, scores or vote-history records are created by importing the audio pack.

To enable this in an environment:

1. Reconcile the existing migration chain (including the parallel migration reserved for `0011`) and apply unapplied migrations through `0013`, then `0014` and `0015`, before deploying the matching code. Preserve applied hosted history and data.
2. Deploy the application **with `public/audio/` and the provenance/credits files**. Existing unsupported songs retain their official listening links.
3. Use the administrator's audio section to import the four-recording pack or discover matches in already imported recordings. Confirm four connected previews and inspect credits.
4. Open Rank and click Listen and rank. Listen, replay, compare and submit a preference without leaving the page. New open recordings become eligible for Play after actual preference votes establish evidence; no initial rating evidence is fabricated.
5. Schedule authorized audio-only songs for a future Daily matchup through the normal admin workflow. Existing active/voted days are never replaced just to demonstrate audio.

## Assets and verification

The assets are committed so normal builds need neither a converter nor live audio downloads. To regenerate reviewed excerpts, supply an installed `ffmpeg` executable in `MUSICALE_FFMPEG` and run `node --import tsx scripts/build-authorized-previews.mjs`. The explicit development script checks current provider permission metadata, downloads only the approved originals, verifies file size/checksum, writes 15-second MP3 excerpts and records provenance. Respect provider rate limits; it fails instead of bypassing them. Originals and the temporary conversion tool remain in ignored `tmp/`; no converter/runtime dependency is added to the application.

The exact downloaded originals matched all four live Wikimedia SHA-1 identities. Unit checks pin the committed excerpt hashes. Browser tests use the **actual committed musical recordings**, observe nonzero decoded audio through a test-only analyser, and exercise pause, mutual exclusion, seek boundaries, replay, a complete timed run, an exhausted seek-back budget and buffering state/gain handling. Buffering state transitions are injected deterministically; the recording/audio decoding itself is not mocked. Existing catalog tests retain a synthetic codec/error fixture for regression coverage.

Final test totals, screenshots and local setup evidence will be recorded after verification completes. Hosted deployment, commercial-preview approval, physical-device listening and large-catalog/provider capacity acceptance remain separate release work.
