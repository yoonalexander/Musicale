# Starter catalog sources

The twenty-song starter file remains curated and unchanged. Admin can additionally discover and import MusicBrainz recordings into the database without replacing this file; see [catalog automation](CATALOG_AUTOMATION.md) for duplicate review, editorial preservation and separate audio authorization.

Twenty curated entries span the 1960s–2020s, multiple languages, genres and regions. This is a starter collection, not the suggested eventual 200–1,000-song launch library. Admin can import up to 100 entries per atomic batch and queue ten curated daily pairs from `data/editorial-pairs.json`. Editors should keep adding verified recordings for their audience.

The following external playback destinations were checked against primary artist, label or provider pages on October 1, 2026. Links open the provider; Musicale copies no audio or artwork. Provider availability can change and can differ by territory. Check playback before scheduling; this source review does not imply universal rights clearance.

| Song                                          | Playback source                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respect — Aretha Franklin                     | [Official upload](https://www.youtube.com/watch?v=JzqGZjFnYnA)                                                                                                                  |
| God Only Knows — The Beach Boys               | [Official video](https://www.youtube.com/watch?v=NADx3-qRxek)                                                                                                                   |
| Dreams — Fleetwood Mac                        | [Artist's video page](https://www.fleetwoodmacofficial.com/video/fleetwood-mac-dreams-official-music-video?page=0), [video](https://www.youtube.com/watch?v=Y3ywicffOj4)        |
| Superstition — Stevie Wonder                  | [Official artist / UMG recording](https://www.youtube.com/watch?v=egqv1mtos6A)                                                                                                  |
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
