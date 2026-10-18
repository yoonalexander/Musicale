# Album artwork provider research

Checked October 18, 2026. Bounded review of two commercial providers, using primary sources only. No account, trial, purchase, provider contact or contract was made. No code, catalog data or artwork permission was changed.

## Recommendation

Music Story is the better documented lead for a **written, game-specific artwork proposal**. Its public product description and identifier API fit the existing catalog more directly than the accessible Gracenote material. This is an engineering assessment of a possible supplier, not a finding that Musicale has permission to use its images. No provider contract has been obtained or verified for Musicale's ranking/guessing game. All currently discovered CAA covers retain their existing unverified permission status.

Keep the existing MusicBrainz matcher and admin permission gate. Evaluate a small artwork-only supplier agreement before adding another API. A provider's license would need to cover its specified assets; it would not automatically authorize existing CAA image copies.

## Evidence and limits

| Provider | What its own sources establish | What remains unverified |
| --- | --- | --- |
| Music Story | Its [offer](https://music-story.com/en/our-offer) lists licensed album artwork and associated rights metadata. The Licenses section states **“Editorial use only by default”** and describes in-app use with terms tailored to the project. Pricing depends on the business model, audience, volume and territories, with a tailored proposal. | Whether the default editorial scope includes ranking cards, voting, guessing clues or answer reveals. No public statement reviewed expressly grants Musicale's game use, whether free or monetized. No quote or executed agreement was obtained. |
| Gracenote | Its [cover-art support FAQ](https://gracenote.my.salesforce-sites.com/articles/Public_FAQ/Can-I-upload-my-cover-art) says label/aggregator covers are supplied to recognition systems that license cover art alongside recognition. [Nielsen's product page](https://www.nielsen.com/solutions/content-metadata/music-recognition/) describes artwork delivery, text matching and audio fingerprint recognition. | Those recognition uses do not establish independent game permission. Game scope, commercial/noncommercial terms, current price and an artwork-only agreement were not verified. The primary developer portal could not be opened during this review; direct MBID/ISRC lookup support therefore remains unverified. |

Music Story's [API reference](https://doc.music-story.com/api/reference) documents recording search at `GET /api/recording` with `isrc` and `musicbrainz_id` filters. It documents album artwork at `GET /api/album/{id}/coverart`, including image paths, dimensions, source and copyright fields. This gives a plausible technical route from existing recording identifiers to supplier metadata and album artwork. It still needs a representative catalog test: identifier availability, recording-to-release selection, edition accuracy and actual image coverage are not proven by documentation. No API calls were made with supplier credentials.

Music Story's [website terms](https://music-story.com/en/terms), sections 1–2, explicitly require additional terms for API/feed/Metadata Monitor users and say website information creates no contractual obligations. Its advertised rights clearance is therefore a supplier lead, not Musicale's license. An API token, copyright field, accessible image URL or attribution line would not resolve the missing agreement.

## Required written confirmation before publication

These are proposed acceptance questions, not established provider terms:

1. Explicitly permit Musicale's ranking, voting and guessing-game screens, including clues and answer reveals, independently of a store-promotion or recognition-only use. State permitted free, advertising, subscription and other commercial models.
2. Identify the exact covered artwork/catalog and the supplier's authority to license the underlying images for this use; disclose exclusions and any separate rights-holder clearance needed.
3. Specify territories, term, resolutions, attribution/linking, resizing/cropping, browser delivery, caching/CDN/storage and whether local copies may be retained. Confirm expiry, revocation, takedown and deletion obligations.
4. Quote the minimum fee, catalog/API allowances and ongoing costs for Musicale's small catalog. Confirm that a coverage pilot or trial does not itself grant production publication rights.

Until a suitable agreement or separate image-specific permission is verified, keep placeholders. Attribution and technical availability alone do not authorize artwork publication.
