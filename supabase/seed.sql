-- Generated from data/songs.json. Preserve editorial changes and all ratings on repeat runs.
insert into public.songs(id,title,normalized_title,artist_name,normalized_artist_name,album_name,release_year,genre) values
('respect-aretha','Respect','respect','Aretha Franklin','aretha franklin','I Never Loved a Man the Way I Love You',1967,'Soul'),
('god-only-knows','God Only Knows','god only knows','The Beach Boys','the beach boys','Pet Sounds',1966,'Pop'),
('dreams-fleetwood-mac','Dreams','dreams','Fleetwood Mac','fleetwood mac','Rumours',1977,'Rock'),
('superstition-stevie-wonder','Superstition','superstition','Stevie Wonder','stevie wonder','Talking Book',1972,'Funk'),
('fast-car-tracy-chapman','Fast Car','fast car','Tracy Chapman','tracy chapman','Tracy Chapman',1988,'Folk Rock'),
('juicy-notorious-big','Juicy','juicy','The Notorious B.I.G.','the notorious b.i.g.','Ready to Die',1994,'Hip-Hop'),
('crazy-in-love-beyonce','Crazy in Love','crazy in love','Beyoncé','beyoncé','Dangerously in Love',2003,'R&B'),
('paper-planes-mia','Paper Planes','paper planes','M.I.A.','m.i.a.','Kala',2007,'Alternative'),
('alright-kendrick-lamar','Alright','alright','Kendrick Lamar','kendrick lamar','To Pimp a Butterfly',2015,'Hip-Hop'),
('bad-guy-billie-eilish','bad guy','bad guy','Billie Eilish','billie eilish','When We All Fall Asleep, Where Do We Go?',2019,'Pop'),
('dynamite-bts','Dynamite','dynamite','BTS','bts','Single',2020,'Disco Pop'),
('waka-waka-shakira','Waka Waka (This Time for Africa)','waka waka (this time for africa)','Shakira feat. Freshlyground','shakira feat. freshlyground','Listen Up! The Official 2010 FIFA World Cup Album',2010,'Pop'),
('alors-on-danse-stromae','Alors on danse','alors on danse','Stromae','stromae','Cheese',2009,'Dance'),
('last-last-burna-boy','Last Last','last last','Burna Boy','burna boy','Love, Damini',2022,'Afrobeats'),
('99-luftballons-nena','99 Luftballons','99 luftballons','Nena','nena','Nena',1983,'New Wave'),
('one-more-time-daft-punk','One More Time','one more time','Daft Punk','daft punk','Discovery',2000,'House'),
('despacito-luis-fonsi','Despacito','despacito','Luis Fonsi feat. Daddy Yankee','luis fonsi feat. daddy yankee','Single',2017,'Reggaeton'),
('three-little-birds-bob-marley','Three Little Birds','three little birds','Bob Marley & The Wailers','bob marley & the wailers','Exodus',1977,'Reggae'),
('sodade-cesaria-evora','Sodade','sodade','Cesária Évora','cesária évora','Miss Perfumado',1992,'Morna'),
('sastanaqqam-tinariwen','Sastanàqqàm','sastanàqqàm','Tinariwen','tinariwen','Elwan',2017,'Desert Blues') on conflict(id) do nothing;
-- Official source links documented in docs/CATALOG.md; audio and artwork are not copied.
insert into public.song_providers(song_id,provider,provider_song_id,external_url) values
('respect-aretha','youtube','JzqGZjFnYnA','https://www.youtube.com/watch?v=JzqGZjFnYnA'),
('god-only-knows','youtube','NADx3-qRxek','https://www.youtube.com/watch?v=NADx3-qRxek'),
('dreams-fleetwood-mac','youtube','Y3ywicffOj4','https://www.youtube.com/watch?v=Y3ywicffOj4'),
('superstition-stevie-wonder','youtube','ftdZ363R9kQ','https://www.youtube.com/watch?v=ftdZ363R9kQ'),
('fast-car-tracy-chapman','youtube','AIOAlaACuv4','https://www.youtube.com/watch?v=AIOAlaACuv4'),
('juicy-notorious-big','youtube','_JZom_gVfuw','https://www.youtube.com/watch?v=_JZom_gVfuw'),
('crazy-in-love-beyonce','youtube','ViwtNLUqkMY','https://www.youtube.com/watch?v=ViwtNLUqkMY'),
('paper-planes-mia','youtube','ewRjZoRtu0Y','https://www.youtube.com/watch?v=ewRjZoRtu0Y'),
('alright-kendrick-lamar','youtube','Z-48u_uWMHY','https://www.youtube.com/watch?v=Z-48u_uWMHY'),
('bad-guy-billie-eilish','youtube','DyDfgMOUjCI','https://www.youtube.com/watch?v=DyDfgMOUjCI'),
('dynamite-bts','youtube','gdZLi9oWNZg','https://www.youtube.com/watch?v=gdZLi9oWNZg'),
('waka-waka-shakira','youtube','pRpeEdMmmQ0','https://www.youtube.com/watch?v=pRpeEdMmmQ0'),
('alors-on-danse-stromae','youtube','J9yzoTHP9HY','https://www.youtube.com/watch?v=J9yzoTHP9HY'),
('last-last-burna-boy','youtube','421w1j87fEM','https://www.youtube.com/watch?v=421w1j87fEM'),
('99-luftballons-nena','youtube','Fpu5a0Bl8eY','https://www.youtube.com/watch?v=Fpu5a0Bl8eY'),
('one-more-time-daft-punk','youtube','FGBhQbmPwH8','https://www.youtube.com/watch?v=FGBhQbmPwH8'),
('despacito-luis-fonsi','youtube','kJQP7kiw5Fk','https://www.youtube.com/watch?v=kJQP7kiw5Fk'),
('three-little-birds-bob-marley','youtube','HNBCVM4KbUM','https://www.youtube.com/watch?v=HNBCVM4KbUM'),
('sodade-cesaria-evora','youtube','ku_WZoTtT8Q','https://www.youtube.com/watch?v=ku_WZoTtT8Q'),
('sastanaqqam-tinariwen','youtube','2I3PLVuKNtw','https://www.youtube.com/watch?v=2I3PLVuKNtw') on conflict(song_id,provider) do nothing;
insert into public.daily_matchups(matchup_day,song_a_id,song_b_id,starts_at,ends_at,status,selection_strategy)
select (now() at time zone 'UTC')::date,'respect-aretha','god-only-knows',
 date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',
 (date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC','scheduled','editorial'
where not exists(select 1 from public.daily_matchups where matchup_day=(now() at time zone 'UTC')::date)
on conflict(matchup_day) do nothing;
