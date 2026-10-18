# Catalog expansion — October 17, 2026

Added forty reviewed songs to production, expanding the active catalog from 24 to **64 songs**, with **60 YouTube sources** and the existing four licensed audio recordings. Pop, rock, soul, funk, hip-hop, disco and K-pop are represented. The import pack is data/catalog-expansion-2026-10-17.json; it uses the existing Admin JSON-import format. Starter test/preview fixtures remain separate.

All forty source IDs were checked using the official YouTube Data API: public, embeddable and available in Canada. Each reached native PLAYING after a player gesture in a diagnostic on Musicale’s canonical HTTPS origin, without mocks. PLAYING can include an advertisement; this does not establish audible music, full-song completion or availability in every country/device. No audio was extracted and no artwork was copied. Genre labels are editorial; release years describe the recording, not a later video upload. Levitating explicitly identifies the DaBaby version. An unverified Gnarls Barkley upload was rejected in favor of the official Uptown Funk source.

The production import inserted only new songs/provider rows inside one guarded transaction. It asserted that every pre-existing song, provider, profile, Daily vote and Rank vote was unchanged. After import: 64 songs, 60 YouTube sources, four existing Rank votes and zero Daily votes. No synthetic preferences, ratings or Play answers were added. The schema and applied migration history were unchanged.

Rank’s main **Listen and rank** action now uses the full playable catalog. The four-recording filter is explicitly labeled **15-second previews only**. Existing audio-only listeners can return to the full catalog with Listen and rank. Play retains its genuine-rating eligibility rule; new songs qualify after accepted community preferences establish untied ratings.

Verification: 44 unit/API checks, TypeScript and the production build passed.
The new full-catalog Rank regression passed in desktop Chromium, WebKit and
mobile Chromium. The existing licensed-audio import/vote/Play/retry browser
case also passed with its explicitly labeled audio-only option. No schema,
voting, rating or scoring function changed.

| Recording                                                      | Reviewed source                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Blinding Lights — The Weeknd                                   | [TheWeekndVEVO](https://www.youtube.com/watch?v=4NRXx6U8ABQ)           |
| Shape of You — Ed Sheeran                                      | [Ed Sheeran](https://www.youtube.com/watch?v=JGwWNGJdvx8)              |
| Rolling in the Deep — Adele                                    | [Adele](https://www.youtube.com/watch?v=rYEDA3JcQqw)                   |
| Hello — Adele                                                  | [Adele](https://www.youtube.com/watch?v=YQHsXMglC9A)                   |
| Blank Space — Taylor Swift                                     | [Taylor Swift](https://www.youtube.com/watch?v=e-ORhEE9VVg)            |
| Shake It Off — Taylor Swift                                    | [Taylor Swift](https://www.youtube.com/watch?v=nfWlot6h_JM)            |
| Flowers — Miley Cyrus                                          | [MileyCyrusVEVO](https://www.youtube.com/watch?v=G7KNmW9a75Y)          |
| As It Was — Harry Styles                                       | [HarryStylesVEVO](https://www.youtube.com/watch?v=H5v3kku4y6Q)         |
| Don't Start Now — Dua Lipa                                     | [Dua Lipa](https://www.youtube.com/watch?v=oygrmJFKYZY)                |
| Levitating (feat. DaBaby) — Dua Lipa feat. DaBaby              | [Dua Lipa](https://www.youtube.com/watch?v=TUVcZfQe-Kw)                |
| Get Lucky — Daft Punk feat. Pharrell Williams and Nile Rodgers | [DaftPunkVEVO](https://www.youtube.com/watch?v=5NV6Rdv1a3I)            |
| Take On Me — a-ha                                              | [a-ha](https://www.youtube.com/watch?v=djV11Xbc914)                    |
| Billie Jean — Michael Jackson                                  | [michaeljacksonVEVO](https://www.youtube.com/watch?v=Zi_XLOBDo_Y)      |
| Beat It — Michael Jackson                                      | [michaeljacksonVEVO](https://www.youtube.com/watch?v=oRdxUFDoQe0)      |
| Smells Like Teen Spirit — Nirvana                              | [NirvanaVEVO](https://www.youtube.com/watch?v=hTWKbfoikeg)             |
| Bohemian Rhapsody — Queen                                      | [Queen Official](https://www.youtube.com/watch?v=fJ9rUzIMcZQ)          |
| Don't Stop Me Now — Queen                                      | [Queen Official](https://www.youtube.com/watch?v=HgzGwKwLmgM)          |
| In the End — Linkin Park                                       | [Linkin Park](https://www.youtube.com/watch?v=eVTXPUF4Oz4)             |
| Numb — Linkin Park                                             | [Linkin Park](https://www.youtube.com/watch?v=kXYiU_JCYtU)             |
| Viva la Vida — Coldplay                                        | [Coldplay](https://www.youtube.com/watch?v=dvgZkm1xWPE)                |
| Yellow — Coldplay                                              | [Coldplay](https://www.youtube.com/watch?v=yKNxeF4KMsY)                |
| Creep — Radiohead                                              | [Radiohead](https://www.youtube.com/watch?v=XFkzRNyygfk)               |
| Karma Police — Radiohead                                       | [Radiohead](https://www.youtube.com/watch?v=1uYWYWPc9HU)               |
| Dancing Queen — ABBA                                           | [AbbaVEVO](https://www.youtube.com/watch?v=xFrGuyw1V8s)                |
| Mamma Mia — ABBA                                               | [AbbaVEVO](https://www.youtube.com/watch?v=unfzfe8f9NI)                |
| I Wanna Dance with Somebody (Who Loves Me) — Whitney Houston   | [whitneyhoustonVEVO](https://www.youtube.com/watch?v=eH3giaIzONA)      |
| I Will Always Love You — Whitney Houston                       | [whitneyhoustonVEVO](https://www.youtube.com/watch?v=3JWTaaS7LdU)      |
| Africa — Toto                                                  | [TotoVEVO](https://www.youtube.com/watch?v=FTQbiNvZqaY)                |
| Everybody Wants to Rule the World — Tears for Fears            | [TearsForFearsVEVO](https://www.youtube.com/watch?v=aGCdLKXNF3w)       |
| September — Earth, Wind & Fire                                 | [EarthWindandFireVEVO](https://www.youtube.com/watch?v=Gs069dndIYk)    |
| Fantasy — Mariah Carey                                         | [MariahCareyVEVO](https://www.youtube.com/watch?v=qq09UkPRdFY)         |
| Hey Ya! — Outkast                                              | [OutkastVEVO](https://www.youtube.com/watch?v=PWgvGjAhvIw)             |
| Uptown Funk — Mark Ronson feat. Bruno Mars                     | [MarkRonsonVEVO](https://www.youtube.com/watch?v=OPf0YbXqDm0)          |
| Mr. Brightside — The Killers                                   | [TheKillersVEVO](https://www.youtube.com/watch?v=gGdGFtwCNBE)          |
| Do I Wanna Know? — Arctic Monkeys                              | [Official Arctic Monkeys](https://www.youtube.com/watch?v=bpOSxM0rNPM) |
| Gangnam Style — PSY                                            | [officialpsy](https://www.youtube.com/watch?v=9bZkp7q19f0)             |
| DDU-DU DDU-DU — BLACKPINK                                      | [BLACKPINK](https://www.youtube.com/watch?v=IHNzOHi8sJs)               |
| Super Shy — NewJeans                                           | [HYBE LABELS](https://www.youtube.com/watch?v=ArmDp-zijuc)             |
| FANCY — TWICE                                                  | [JYP Entertainment](https://www.youtube.com/watch?v=kOHB85vDuow)       |
| DESPECHÁ — Rosalía                                             | [RosaliaVEVO](https://www.youtube.com/watch?v=5g2hT4GmAGU)             |
