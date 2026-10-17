# Musicale: YouTube Playback Integration

**Status:** Implementation specification  
**Date:** October 16, 2026  
**Priority:** Core gameplay  
**Scope:** YouTube video matching, visible in-card playback, optional timed listening segments, graceful fallback, and maintenance

## 1. Executive Summary

Musicale is a head-to-head music-ranking web app. Users compare two mainstream songs and vote; Musicale stores its own ranking and vote data in Supabase. Today, its catalog is manually curated and listening is primarily through outbound links. The proposed integration makes listening possible **inside Musicale** using official **YouTube embedded video players**.

The YouTube approach is a deliberate compromise: mainstream catalog coverage and relatively low infrastructure cost, in exchange for visible video players, YouTube-controlled ads and playback UI, embeddability restrictions, and compliance requirements. **It is not an audio-only player.**

### Decisions

1. **Use YouTube IFrame Player API for playback**, not downloaded or extracted audio.
2. **Preserve Supabase as the source of truth** for songs, provider associations, daily matches, Elo, vote records, and analytics.
3. **Put a visible, unobstructed YouTube player in a corner/lower subsection of each comparison card**, rather than behind the card or under a tint. Player viewport must be at least 200 × 200 CSS pixels, with enough space for native controls; prefer a 16:9 player closer to 480 × 270 where room allows.
4. **Use manually curated start timestamps** initially; optionally suggest a 15-second listening segment via supported API `startSeconds` and `endSeconds`. Do not promise frame-exact duration or block normal YouTube controls. Verify final timed-playback behavior against policy before production release.
5. **Only one video should play at a time.** User-initiated playback is the default; do not auto-start playback on page load or between matchups.
6. **Match songs to YouTube videos once, then persist the video ID.** Never perform a YouTube search on every page view or vote.
7. **Prefer correct official audio**, then official music video, then verified equivalent uploads. Reject live versions, covers, remixes, sped-up versions, and lyric edits unless that is the canonical song version or specifically approved.
8. **Provide a fallback external YouTube link** when embedding is unavailable. Voting remains functional.

## 2. Existing Musicale Architecture to Preserve

Based on the current agent's repository inspection (revalidate all paths and schema before coding):

- `data/songs.json`: 20 curated songs with YouTube destinations.
- Supabase PostgreSQL: `songs`, `song_providers`, and existing ranking/voting tables.
- Existing seed script plus admin JSON/CSV import and individual editing.
- Existing `get_today_matchup`, `song_catalog` reads, and Elo vote processing.
- Play, Rank, and Daily comparison experiences.
- Existing `audio_sources` and playback analytics groundwork, although no local authorized audio sources are currently configured.

**Do not replace these systems or migrate Elo logic.** Adapt to current repository reality. YouTube videos belong in the existing provider association system; they should not be misrepresented as licensed standalone audio sources.

## 3. Goals and Non-goals

### Goals

- Stream mainstream songs from embeddable YouTube videos inside Musicale.
- Let users compare two songs and vote without leaving the site when videos are available.
- Deliver a consistent, responsive, accessible player across Play, Rank, and Daily.
- Maintain playback exclusivity and correct loading/error states.
- Build a repeatable, auditable song-to-video discovery workflow.
- Minimize YouTube Data API usage through persisted IDs and batch validation.
- Keep existing rankings and voting independent from playback availability.

### Non-goals

- Extracting YouTube audio or producing MP3 clips.
- Hiding the YouTube video behind artwork, 50% overlays, UI elements, offscreen containers, or CSS tricks.
- Removing or obscuring YouTube branding, controls, or advertising.
- Promising a hard, non-bypassable 15-second limit.
- Reliably locating the chorus with YouTube Data API alone.
- Replacing Supabase or adding a second canonical music database.
- Requiring users to listen before being allowed to vote.

## 4. End-user Experience

### Desktop

Each comparison card contains:

1. Album art, song title, artist, release information (as already supported).
2. **Visible YouTube video** in a dedicated corner or lower inset section, not layered over artwork or controls. Keep the player unobstructed with a sufficiently large viewing area.
3. Optional label such as **“Suggested 15s listen”** and **“Replay segment”** outside the iframe. These controls must not prevent use of the native YouTube controls.
4. An ordinary Musicale vote button separate from the player.

Both cards may contain player instances, but only one can be actively playing. On small desktop widths, expand the player section rather than reduce it below the minimum. Avoid costly simultaneous video loads if possible.

### Mobile

Stack the song cards. Where a corner inset cannot meet YouTube's size and control requirements, make the video player full-width within the card. Never scale or crop the video to make a player look smaller than the permitted minimum. Respect safe areas and ensure the vote buttons remain easy to tap.

### States

- **Ready:** A supported video ID is associated with this song.
- **Loading:** Player script/iframe loading; don't promise audio until playback begins.
- **Playing / paused:** Controlled by YouTube playback events.
- **Ad / buffering / seeking:** Do not count these as confirmed song listening time; ads are controlled by YouTube.
- **Unavailable:** Display friendly message and the already-supported external provider link.
- **Alternative available:** Offer a validated backup ID, with selection logic that respects version accuracy.

### Copy examples

- `Watch / listen on Musicale`
- `Suggested 15-second section`
- `Video unavailable here. Open on YouTube`
- `This video can't be embedded in your region`

## 5. Playback API Integration

Use the official [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference). Load its script once, initialize and destroy player instances predictably, and subscribe to state/error events.

Conceptual code (adapt to the actual React/Next.js client architecture):

```ts
// Trigger this only after explicit user interaction.
player.loadVideoById({
  videoId: selectedVideoId,
  startSeconds: previewStartSeconds,
  endSeconds: previewStartSeconds + 15,
});
```

**Caveats:** `endSeconds` is an API feature, not a guarantee of frame-exact playback. After seeking, `endSeconds` may no longer apply, according to the official API reference. Do not fight the user's native YouTube playback controls. Make timed listening a suggested experience, and verify whether any forced replay/stop behavior is appropriate under YouTube's policies before launch.

### Coordination

Implement a single playback coordinator/context so that when one player starts, other Musicale players pause. React component unmounting or matchup changes must stop/dispose old players. Avoid excessive `getCurrentTime()` polling and re-render loops. Use event-driven state with coarse sampling only when needed for a local progress indicator.

### Player implementation rules

- Maintain iframe sizing at **200 × 200 px minimum**, and enough room for native controls; 480 × 270 is the documented recommendation for 16:9 players.
- Do not cover any portion of the iframe with overlays, translucent masks, voting buttons, CSS pseudo-elements, tooltips, or decorative frames that obscure it.
- Do not use background playback, audio-only extraction, or invisible/offscreen iframes.
- Do not rely on muted autoplay or automatic continuation between songs.
- Do not disable or hide the user's ability to use normal player functionality.
- Preserve YouTube player identification by ensuring an appropriate HTTP Referer / referrer policy; avoid `no-referrer` policies that suppress it.
- Expect cookies/consent prompts, ads, network failures, blocked embeds, and ad blockers.

## 6. Video Discovery and Matching

### Sources and division of responsibility

- **Existing `songs` table:** Canonical Musicale song identity, metadata, genre, artwork as already authorized, and ranking.
- **YouTube Data API v3:** Find and validate candidate *video IDs*. Use `search.list` for discovery and `videos.list` for metadata/availability, not page-load playback.
- **Existing `song_providers`:** Store the selected YouTube video ID, URL, source status, and review metadata; extend only if needed.
- **MusicBrainz or another metadata source (optional):** Enhance recording/artist identity independently of YouTube. Do not require this to complete YouTube playback.

### Candidate discovery

Construct searches such as:

- `"{artist}" "{track}" official audio`
- `"{artist}" "{track}" official music video`

Use the YouTube Data API embeddable filter during discovery when suitable, then inspect `videos.list` metadata including embeddability, duration, publication/channel info, and geographic restrictions where reported. The discovery filter is **not a lifetime guarantee** that embedded playback will work.

### Matching guidelines

Prefer, in order:

1. Artist/label official audio upload corresponding to the canonical studio recording.
2. Official music video if it contains the correct recording and no substantial alternate audio.
3. Artist-verified/label-verified equivalent content.
4. Other sources only after manual approval and terms review.

Reject or escalate remixes, karaoke, slowed/sped-up, covers, extended versions, live versions, misleading “official” titles, and videos with substantial non-song intros unless deliberately approved. Match normalized artist/title plus version tags; use channel evidence, duration sanity checks, and release context. **Do not use a simplistic title similarity score as proof of identity.**

Suggested statuses: `unmatched`, `candidate`, `needs_review`, `approved`, `unavailable`, `rejected`.

### Admin review

Add an admin workflow that can:

- Search candidates, see channel/duration/title and open the candidate video.
- Assign an approved primary ID and optional backup.
- Edit suggested start second and document why.
- Mark failed/restricted candidates, retry discovery, and preserve edits on sync.
- Bulk-review low-confidence matches and detect duplicates.

**Initially curate the first 20 songs** before attempting thousands of songs automatically. Preserve all existing IDs and votes.

## 7. Database Design (Illustrative, Not a Migration to Run Blindly)

Adapt existing `song_providers`; do not create redundant YouTube-only song tables without need.

Potential fields in or alongside the existing provider records:

| Field | Meaning |
|---|---|
| `song_id` | Foreign key to existing Musicale song |
| `provider` | `youtube` |
| `provider_track_id` | YouTube video ID |
| `provider_url` | Canonical video link |
| `match_status` | Candidate / reviewed / unavailable |
| `match_confidence` | Discovery heuristic, not legal or playback guarantee |
| `reviewed_at`, `reviewed_by` | Auditability |
| `preview_start_seconds` | Optional editor-curated start |
| `suggested_segment_seconds` | 15 by default |
| `last_validated_at` | Validation time |
| `last_error_code` | Last known API/embed error |
| `is_primary` | Preferred match for song |

Store alternates in the existing normalized relationship pattern where possible. Add constraints to avoid duplicate provider-video associations and contradictory primary selections. Maintain backward compatibility with existing JSON/CSV imports and seed scripts. Do not associate a YouTube embed URL with an `audio_sources` row that implies rights to a standalone audio stream.

## 8. Discovery / Validation Jobs

### Ingestion

1. Admin selects or imports songs.
2. For records missing a reviewed YouTube ID, query YouTube within quota and rate limits.
3. Normalize candidates, rank quality, and save candidates.
4. Automatically approve only if validation and confidence thresholds are truly robust; otherwise require review.
5. Save reviewed IDs in Supabase for reuse.

### Ongoing validation

- Run scheduled batches using `videos.list`, which can retrieve multiple video IDs per request.
- Update missing/private/disabled/known regional restrictions as discoverable.
- Do not automatically remove a song from Musicale if its YouTube source fails.
- Re-discover only invalid/unmatched records, respecting daily quota and backoff.
- Use client playback errors as signals for review, not definitive universal availability judgments.
- Respect YouTube API data storage/refresh/deletion requirements; audit API-derived cached fields against current policy.

### Quota planning

As of October 2026, official YouTube quota documentation describes a **default of 100 `search.list` calls per day**, with `search.list` costing one search call, plus a combined 10,000 daily units for other endpoints such as `videos.list` (one unit per call). Check the actual quota shown in your Google Cloud project; quotas can differ. [Quota calculator](https://developers.google.com/youtube/data/determine_quota_cost).

Playback of a saved ID using the iframe API does **not** require a new YouTube Data API `search.list` call. Cache approved video IDs in your own provider records, rather than repeating searches for each user.

## 9. Backend and Frontend Interfaces

Fit implementation into the repository's existing Next.js/Supabase patterns. Candidate interfaces, not prescriptive endpoint names:

```ts
type YouTubeSource = {
  provider: 'youtube';
  videoId: string;
  watchUrl: string;
  previewStartSeconds: number | null;
  suggestedSegmentSeconds: 15;
  reviewed: boolean;
};

type SongPlayback = {
  songId: string;
  youtube: YouTubeSource | null;
  fallbackLinks: Array<{ provider: string; url: string }>;
};
```

Suggested modules:

- A server-side discovery/validation service using a restricted YouTube Data API credential.
- A repository/service layer returning *approved* provider IDs for matchups.
- A client-only `YouTubeEmbed` wrapper that handles player lifecycle and events.
- A shared playback coordinator for single-active-player behavior.
- A reusable `SongVideoPreview` card subsection used by Daily, Play, and Rank.
- Admin review and timestamp editing components.

Use environment variables; never expose server API secrets. If client-side keys are used for public endpoints, apply strict origin/API restrictions. Rate-limit admin and import operations. Do not introduce a separate backend solely for this integration without a strong reason.

## 10. Analytics

The existing `preview_started` event historically tracked external link clicks, not confirmed playback. Preserve legacy data semantics and introduce explicit event names:

| Event | Trigger |
|---|---|
| `listening_link_clicked` | User opens an external provider URL |
| `youtube_player_ready` | YouTube emits a ready event |
| `youtube_play_started` | YouTube reports PLAYING; note this may not prove that song audio is audible because ads can intervene |
| `youtube_player_error` | The iframe API provides a playback error |
| `suggested_segment_replayed` | User explicitly chooses replay of a suggested segment |
| `vote_submitted` | Existing event, unchanged |

Avoid claiming that any event confirms 15 seconds of actual music listened to. Never gate voting on inferred watching/listening.

## 11. Error Handling and Fallback Matrix

| Failure | Behavior |
|---|---|
| No reviewed video | Show external links; flag admin discovery |
| Embed restricted | Show external YouTube link and optional approved alternative |
| Video deleted or private | Mark failed; schedule revalidation; keep song and votes |
| Region restriction | Show appropriate fallback; do not declare globally removed |
| Browser autoplay blocked | Require explicit user click |
| Ad before song | Allow native ad experience; do not conceal or bypass |
| Slow network / buffering | Display loading state outside iframe without obscuring it |
| Quota exhausted during ingestion | Defer background discoveries; existing embedded videos still load |
| YouTube iframe blocked by browser/CSP | Offer provider link, log non-sensitive error |
| Wrong song detected | Allow admin override; do not silently ship an unverified match |

## 12. Security, Privacy, and Policy Checklist

Before launch, review the **latest** official terms, not only this document:

- [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [Data API Quotas](https://developers.google.com/youtube/data/determine_quota_cost)
- [YouTube Data API Video Resource](https://developers.google.com/youtube/v3/docs/videos)

Check:

- Visible video and minimum size, with fully usable player controls.
- No masks/tint/obscuring overlays, including modal stacking over the player.
- No audio extraction or background-only playback.
- No suppression of YouTube ads, attribution, or branding.
- No forced restriction of normal YouTube user controls; timed segment behavior is reviewed before enabling in production.
- YouTube client identity/referrer requirements and relevant browser CSP settings.
- Proper user-facing Terms of Service and Privacy Policy disclosures and links as required.
- Applicable YouTube API data retention/refresh, disclosure, deletion, and consent requirements.
- Secure API keys, admin authorization, and privacy-conscious telemetry.

**Release blocker:** If the proposed forced 15-second cutoff or mini-player behavior conflicts with applicable YouTube policy, ship the compliant full player with optional guided 15-second selection, or seek clarification. Do not quietly bypass rules.

## 13. Testing Plan

### Unit

- Song/video matching and version rejection.
- Provider ID deduplication and primary/alternate selection.
- Timestamp validation (`0 <= start < duration` where duration known).
- Quota/backoff handling and API response normalization.
- Correct analytics event names.

### Integration

- Existing 20 songs remain in database and preserve rankings.
- Admin discovery, review, save, refresh, and failure recovery.
- Correct source returned for Daily, Play, and Rank.
- Existing vote + Elo logic unchanged.
- Only one playing embed after switching A/B.
- Destroy iframe cleanly on navigation or new matchup.

### Browser / manual

- Desktop Chrome, Firefox, Safari where available; mobile iOS Safari and Android Chrome.
- Test player at minimum supported card widths; ensure native controls visible and unobstructed.
- Test user gesture initiation, pause, seek, replay, buffering, ad interruptions, error callbacks.
- Test a known correct official-audio match and an official music video with a long intro.
- Test disabled embedding and regional unavailability.
- Test with ad blockers, constrained connection, and privacy settings.
- Run typecheck, lint, application test suite, and production build.

## 14. Milestones and Acceptance Criteria

### Milestone A: Integrate playable embeds with existing 20 songs

- Extract/normalize stored video IDs from existing YouTube links.
- Verify a representative sample of IDs and manually approve them.
- Show one working player inside each relevant song card when available.
- Support user-controlled playback and single-player exclusivity.
- Preserve all ranking and voting behavior.

**Acceptance:** A user can open a Daily or Play matchup and watch/listen to a real embeddable mainstream recording within Musicale, then vote without leaving the site.

### Milestone B: Improve player experience

- Reusable player in Daily, Play, and Rank.
- Responsive layouts respecting player minimums.
- Optional suggested 15s segment, curated start point, replay, error handling.
- Explicit analytics and robust cleanup.

**Acceptance:** The comparison experience works on desktop and mobile; unsupported clips fall back cleanly; player does not break normal YouTube controls.

### Milestone C: Automate video discovery

- Server-side YouTube Data API integration.
- Candidate generation, validation, deduplication, admin approval.
- Scheduled revalidation with quota limits.

**Acceptance:** Admin can import a new mainstream song, inspect candidates, choose a correct official recording, set start timestamp, and publish it without manually finding and typing the video URL.

### Milestone D: Hardening

- Resolve policy review questions about timed playback.
- Improve accessibility, privacy notice, retry behavior, instrumentation, and test coverage.
- Verify representative real recordings in production-like environments.

**Acceptance:** Integration is reliable and policy-reviewed, not merely visually present.

## 15. Open Risks and Product Decisions

1. **15-second cutoff compliance:** API supports end times but YouTube protects ordinary player functionality; do not assume forcing every playback to stop after 15 seconds is permitted.
2. **UI density:** Two 200 × 200+ players plus album artwork may create tall cards on mobile. Favor legibility and compliance over tiny player aesthetics.
3. **Ads:** YouTube may show ads or controls that alter timing and user experience; Musicale cannot suppress them.
4. **Mainstream availability:** Even official music videos can be unavailable by region or restricted from embedding.
5. **Catalog scale:** YouTube video matching requires editorial quality assurance and quota management.
6. **Official audio vs. music video:** The upload most suitable for listening may differ from the most visible official video.
7. **Privacy/consent:** Third-party iframe loading affects privacy and should be reflected in disclosures and applicable consent flows.

## 16. Codex Execution Instructions

1. Inspect the existing repository, migrations, components, admin patterns, and current branches/worktrees before editing.
2. Prefer small, backward-compatible schema changes and reuse `song_providers` and existing APIs.
3. Implement Milestone A end to end before expanding scope; verify actual successful embedded playback using real existing song IDs in a browser.
4. Proceed through milestones with tests, preserving Daily/Play/Rank and existing vote integrity.
5. Do not invent audio rights, hide video, or state that a missing video is playable.
6. Do not run destructive migrations against production, deploy, or push unless authorized.
7. If a policy requirement cannot be satisfied, use the compliant fallback and report the blocker explicitly.
8. At completion, report: files changed, migrations, approved video count, actual playback test results, cross-browser limitations, API quota usage, policy review items, and any songs without working embedded playback.

---

## Reference Documents

- [YouTube Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [YouTube IFrame Player API Reference](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube API Quota Calculator](https://developers.google.com/youtube/data/determine_quota_cost)
- [YouTube Data API Search](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube Videos Resource](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)

*This design is technical guidance, not a legal opinion or a guarantee that a given playback flow is approved by YouTube. Verify policies at release time.*
