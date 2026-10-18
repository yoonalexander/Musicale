# Starter catalog sources

Production additionally includes [forty reviewed YouTube songs](CATALOG_EXPANSION_2026_10_17.md),
for 64 songs total with the four licensed recordings. The starter file below
remains the small preview/test fixture; it is not the full production catalog.

The twenty-song starter file remains curated and unchanged. Admin can additionally discover and import MusicBrainz recordings into the database without replacing this file; see [catalog automation](CATALOG_AUTOMATION.md) for duplicate review, editorial preservation and separate audio authorization.

Twenty curated entries span the 1960s–2020s, multiple languages, genres and regions. This is the modest verified launch catalog; a larger library is optional ongoing curation. Admin can import up to 100 entries per atomic batch and queue thirty distinct curated daily pairs from `data/editorial-pairs.json`. Editors should keep adding verified recordings for their audience.

[October 16, 2026 verification](CATALOG_VERIFICATION.md) records the current twenty-link and release-year review.

The following external playback destinations were checked against primary artist, label or provider pages on October 1, 2026. Links open the provider; Musicale copies no audio or artwork. Provider availability can change and can differ by territory. Check playback before scheduling; this source review does not imply universal rights clearance.

| Song                                          | Playback source                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respect — Aretha Franklin                     | [Official upload](https://www.youtube.com/watch?v=JzqGZjFnYnA)                                                                                                                  |
| God Only Knows — The Beach Boys               | [Official video](https://www.youtube.com/watch?v=NADx3-qRxek)                                                                                                                   |
| Dreams — Fleetwood Mac                        | [Artist's video page](https://www.fleetwoodmacofficial.com/video/fleetwood-mac-dreams-official-music-video?page=0), [video](https://www.youtube.com/watch?v=Y3ywicffOj4)        |
| Superstition — Stevie Wonder                  | [Official artist / UMG Talking Book recording](https://www.youtube.com/watch?v=ftdZ363R9kQ)                                                                                     |
| Fast Car — Tracy Chapman                      | [Official artist video](https://www.youtube.com/watch?v=AIOAlaACuv4)                                                                                                            |
| Juicy — The Notorious B.I.G.                  | [Official video](https://www.youtube.com/watch?v=_JZom_gVfuw)                                                                                                                   |
| Crazy in Love — Beyoncé                       | [Artist video](https://www.youtube.com/watch?v=ViwtNLUqkMY)                                                                                                                     |
| Paper Planes — M.I.A.                         | [Official artist video](https://www.youtube.com/watch?v=ewRjZoRtu0Y)                                                                                                            |
| Alright — Kendrick Lamar                      | [Official music video](https://www.youtube.com/watch?v=Z-48u_uWMHY)                                                                                                             |
| bad guy — Billie Eilish                       | [Official artist video](https://www.youtube.com/watch?v=DyDfgMOUjCI)                                                                                                            |
| Dynamite — BTS                                | [Label release page](https://ibighit.com/legacy/bts/dynamite-en.html), [official video](https://www.youtube.com/watch?v=gdZLi9oWNZg)                                            |
| Waka Waka — Shakira feat. Freshlyground       | [Official video](https://www.youtube.com/watch?v=pRpeEdMmmQ0)                                                                                                                   |
| Alors on danse — Stromae                      | [Official artist video](https://www.youtube.com/watch?v=J9yzoTHP9HY)                                                                                                            |
| Last Last — Burna Boy                         | [Official music video](https://www.youtube.com/watch?v=421w1j87fEM)                                                                                                             |
| 99 Luftballons — Nena                         | [Official artist video](https://www.youtube.com/watch?v=Fpu5a0Bl8eY), [artist album page](https://www.nena.de/alben-ansicht/nena)                                               |
| One More Time — Daft Punk                     | [Official video](https://www.youtube.com/watch?v=FGBhQbmPwH8)                                                                                                                   |
| Despacito — Luis Fonsi feat. Daddy Yankee     | [Artist video](https://www.youtube.com/watch?v=kJQP7kiw5Fk)                                                                                                                     |
| Three Little Birds — Bob Marley & The Wailers | [Official music video](https://www.youtube.com/watch?v=HNBCVM4KbUM)                                                                                                             |
| Sodade — Cesária Évora                        | [Official artist video](https://www.youtube.com/watch?v=ku_WZoTtT8Q), [artist video index](https://cesaria-evora.com/videos/)                                                   |
| Sastanàqqàm — Tinariwen                       | [Label video page](https://www.anti.com/videos/sastanaqqam), [label album metadata](https://www.anti.com/releases/elwan/), [video](https://www.youtube.com/watch?v=2I3PLVuKNtw) |

Release years describe the song's original release, not the later upload date. Genre labels are broad editorial classifications. Music videos may contain additional intros, edits or performance footage; duration is left unset unless an editor verifies the intended recording. Album artwork remains a letter placeholder by default. The editor supports permission-confirmed HTTPS artwork URLs without proxying or caching images.

`data/songs.json` is the source for preview mode and the downloadable starter import. Run `node scripts/generate-seed.mjs` after changing it to regenerate `supabase/seed.sql`. Repeat seeding preserves existing metadata, availability, providers, ratings and scheduled days.

## October 17 YouTube validation

The Data API reports all twenty original videos as embeddable, but the previous
Superstition source `egqv1mtos6A` has an allowed-country list excluding Canada.
The starter catalog now selects `ftdZ363R9kQ`: the Stevie Wonder Topic channel's
UMG-provided Talking Book recording, with 1972 Motown attribution and a 4:27
duration. The API explicitly permits Canada, and a native-player diagnostic on
Musicale's HTTPS origin reached PLAYING. This approves one new starter source;
song identity and vote data are preserved. Existing databases keep their current
provider when reseeded; an editor must save/import the reviewed change there.

All nineteen other saved videos and this replacement reached PLAYING in that
same HTTPS-origin diagnostic. This is player-state evidence, not proof of audible
music or universal regional availability. The earlier local HTTP failures do not
establish that the uploaders disabled embedding. The 99 Luftballons source is
marked Made for Kids; custom player tracking is disabled for it.
