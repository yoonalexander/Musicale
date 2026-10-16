begin;

-- Existing and manually saved songs have no automatically managed fields.
alter table songs add column catalog_managed_fields text[] not null default '{}';
alter table songs add column artwork_source_url text;
alter table songs add column artwork_attribution text;
alter table songs add constraint https_artwork_source check(artwork_source_url is null or
  (length(artwork_source_url)<=2000 and artwork_source_url ~ '^https://[^/@[:space:]]+(/|$)'));
create or replace function audit_admin_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and is_admin() and
    (TG_TABLE_NAME<>'songs' or TG_OP<>'UPDATE' or
      (to_jsonb(new)-array['elo_rating','wins','losses','matchup_count','updated_at'])<>
      (to_jsonb(old)-array['elo_rating','wins','losses','matchup_count','updated_at'])) then
    insert into admin_audit_log(actor_id,entity,entity_id,operation,before_value,after_value)
    values(auth.uid(),TG_TABLE_NAME,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',
      to_jsonb(new)->>'song_id',to_jsonb(old)->>'song_id'),TG_OP,to_jsonb(old),to_jsonb(new));
  end if;
  return coalesce(new,old);
end $$;
create table catalog_sources (
  provider text not null check(provider='musicbrainz'),
  provider_song_id text not null check(char_length(provider_song_id) between 1 and 200),
  song_id text not null references songs(id) on delete cascade,
  isrcs text[] not null default '{}',
  metadata jsonb not null check(jsonb_typeof(metadata)='object'),
  source_url text not null,
  metadata_license text not null check(metadata_license='CC0-1.0'),
  synced_at timestamptz not null default now(),
  primary key(provider,provider_song_id),
  check(source_url='https://musicbrainz.org/recording/'||provider_song_id),
  check(cardinality(isrcs)<=100)
);
create index catalog_sources_song on catalog_sources(song_id);
create index catalog_sources_isrc on catalog_sources using gin(isrcs);
alter table catalog_sources enable row level security;
revoke all on catalog_sources from public,anon,authenticated;
grant select on catalog_sources to authenticated;
create policy admin_catalog_sources on catalog_sources for select using(is_admin());
create trigger sources_admin_audit after insert or update or delete on catalog_sources
  for each row execute function audit_admin_change();

create table catalog_request_slots(provider text primary key check(provider='musicbrainz'),next_at timestamptz not null);
alter table catalog_request_slots enable row level security;
revoke all on catalog_request_slots from public,anon,authenticated;
create function reserve_catalog_provider_call() returns boolean language plpgsql security definer set search_path=public as $$
declare claimed text;
begin
  if not is_admin() then raise exception 'Admin access required';end if;
  insert into catalog_request_slots values('musicbrainz',clock_timestamp()+interval '1100 milliseconds')
  on conflict(provider) do update set next_at=clock_timestamp()+interval '1100 milliseconds'
    where catalog_request_slots.next_at<=clock_timestamp() returning provider into claimed;
  return claimed is not null;
end $$;
revoke all on function reserve_catalog_provider_call() from public,anon;
grant execute on function reserve_catalog_provider_call() to authenticated;

create function catalog_key(value text) returns text language sql immutable parallel safe set search_path=public as $$
  select regexp_replace(lower(normalize(coalesce(value,''),NFKC)),'[^[:alnum:]]','','g')
$$;
revoke all on function catalog_key(text) from public,anon;
grant execute on function catalog_key(text) to authenticated;
create index songs_discovery_key on songs(catalog_key(title),catalog_key(artist_name));
create function find_catalog_matches(c jsonb) returns table(song_id text,reason text)
language sql stable security definer set search_path=public as $$
  with identifiers as (
    select s.song_id from catalog_sources s where s.provider=c->>'provider'
      and s.provider_song_id=c->>'providerId'
    union select p.song_id from song_providers p where p.provider=c->>'provider' and p.provider_song_id=c->>'providerId'
    union select p.song_id from song_providers p join jsonb_array_elements(c->'song'->'providers') supplied
      on p.provider=supplied->>'provider' and p.provider_song_id=supplied->>'providerSongId'
    union select s.song_id from catalog_sources s where s.isrcs && array(select jsonb_array_elements_text(c->'isrcs'))
  )
  select i.song_id,'identifier' from identifiers i
  union all
  select s.id,'metadata' from songs s where catalog_key(s.title)=catalog_key(c->'song'->>'title')
    and catalog_key(s.artist_name)=catalog_key(c->'song'->>'artistName')
    and not exists(select 1 from identifiers i where i.song_id=s.id)
$$;
revoke all on function find_catalog_matches(jsonb) from public,anon,authenticated;
create function catalog_duplicates(p_candidates jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Admin access required';end if;
  if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>10
    or octet_length(p_candidates::text)>200000 then raise exception 'Review up to 10 candidates';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('providerId',c->>'providerId','matches',
    coalesce((select jsonb_agg(to_jsonb(m) order by m.song_id) from find_catalog_matches(c) m),'[]'::jsonb)))
    from jsonb_array_elements(p_candidates) c),'[]'::jsonb);
end $$;
revoke all on function catalog_duplicates(jsonb) from public,anon;
grant execute on function catalog_duplicates(jsonb) to authenticated;

-- Changed fields leave automatic management even when edited through the direct admin API.
create function protect_catalog_edits() returns trigger language plpgsql set search_path=public as $$
declare field text;
begin
  foreach field in array old.catalog_managed_fields loop
    if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
      new.catalog_managed_fields:=array_remove(new.catalog_managed_fields,field);
    end if;
  end loop;
  return new;
end $$;
create trigger protect_catalog_edits before update on songs for each row execute function protect_catalog_edits();
alter function process_catalog(jsonb) rename to process_manual_catalog;
revoke all on function process_manual_catalog(jsonb) from public,anon,authenticated;
create function process_catalog(p_songs jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  perform process_manual_catalog(p_songs);
  update songs set catalog_managed_fields='{}' where id in(select s->>'id' from jsonb_array_elements(p_songs) s);
  update songs t set artwork_source_url=coalesce(nullif(s->>'artworkSourceUrl',''),nullif(s->>'artworkUrl','')),
    artwork_attribution=nullif(s->>'artworkAttribution','')
    from jsonb_array_elements(p_songs) s where t.id=s->>'id';
end $$;
revoke all on function process_catalog(jsonb) from public,anon,authenticated;

create function ingest_catalog(p_candidates jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb;s jsonb;p jsonb;target text;strong text[];possible text[];managed text[];existing songs;ids text[]:='{}';codes text[];
begin
  if not reserve_request('admin') then return jsonb_build_object('error','Too many requests. Try again next minute.');end if;
  begin
    if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates) not between 1 and 10
      or octet_length(p_candidates::text)>200000 then raise exception 'Import 1 to 10 candidates';end if;
    -- Serialize imports and direct catalog edits before resolving identities; votes retain their original records.
    lock table songs,song_providers,catalog_sources in share row exclusive mode;
    for c in select * from jsonb_array_elements(p_candidates) loop
      s:=c->'song';
      if c->>'provider'<>'musicbrainz' or c->>'provider' is null or c->>'metadataLicense' is distinct from 'CC0-1.0'
        or c->>'sourceUrl' is distinct from 'https://musicbrainz.org/recording/'||(c->>'providerId')::uuid::text
        or char_length(trim(s->>'title')) not between 1 and 200 or s->>'title' is null
        or char_length(trim(s->>'artistName')) not between 1 and 200 or s->>'artistName' is null
        or s->>'releaseYear' is null
        or char_length(s->>'albumName')>200 or char_length(s->>'genre')>100
        or jsonb_typeof(c->'isrcs') is distinct from 'array' or jsonb_array_length(c->'isrcs')>100
        or jsonb_typeof(s->'providers') is distinct from 'array' or jsonb_array_length(s->'providers')>4 then
        raise exception 'Invalid discovery candidate';end if;
      codes:=array(select distinct jsonb_array_elements_text(c->'isrcs'));
      if exists(select 1 from unnest(codes) code where code !~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$') then raise exception 'Invalid ISRC';end if;
      select array_agg(song_id) filter(where reason='identifier'),array_agg(song_id) into strong,possible from find_catalog_matches(c);
      target:=nullif(c->>'targetSongId','');
      if cardinality(strong)>1 then raise exception 'Conflicting identifiers require duplicate review';end if;
      if cardinality(strong)=1 then
        if target is not null and target<>strong[1] then raise exception 'Identifier belongs to another song';end if;
        target:=strong[1];
      elsif target is not null then
        if not target=any(coalesce(possible,'{}')) then raise exception 'Choose a listed duplicate';end if;
      elsif cardinality(possible)>0 and coalesce(c->>'createSeparate','false')<>'true' then
        raise exception 'Review possible duplicates before importing';
      end if;
      if target is null then
        target:='mb-'||(c->>'providerId')::uuid::text;
        insert into songs(id,title,normalized_title,artist_name,normalized_artist_name,album_name,release_year,
          genre,status,release_date,duration_ms)
        values(target,s->>'title',lower(s->>'title'),s->>'artistName',lower(s->>'artistName'),coalesce(s->>'albumName','Single'),
          (s->>'releaseYear')::int,s->>'genre','unavailable',nullif(s->>'releaseDate','')::date,(s->>'durationMs')::int);
        managed:=array['title','artist_name','album_name','release_year','release_date','duration_ms','genre'];
      else
        select * into strict existing from songs where id=target;
        managed:=existing.catalog_managed_fields;
        update songs set
          title=case when 'title'=any(managed) then s->>'title' else title end,
          normalized_title=case when 'title'=any(managed) then lower(s->>'title') else normalized_title end,
          artist_name=case when 'artist_name'=any(managed) then s->>'artistName' else artist_name end,
          normalized_artist_name=case when 'artist_name'=any(managed) then lower(s->>'artistName') else normalized_artist_name end,
          album_name=case when 'album_name'=any(managed) then coalesce(s->>'albumName','Single') else album_name end,
          release_year=case when 'release_year'=any(managed) then (s->>'releaseYear')::int else release_year end,
          release_date=case when 'release_date'=any(managed) and 'release_year'=any(managed) then nullif(s->>'releaseDate','')::date else release_date end,
          duration_ms=case when 'duration_ms'=any(managed) then (s->>'durationMs')::int else duration_ms end,
          genre=case when 'genre'=any(managed) then s->>'genre' else genre end,
          updated_at=now() where id=target;
      end if;
      -- The trigger removes manual changes; this explicit step restores this import's managed fields.
      update songs set catalog_managed_fields=managed where id=target;
      insert into catalog_sources(provider,provider_song_id,song_id,isrcs,metadata,source_url,metadata_license)
      values('musicbrainz',c->>'providerId',target,codes,c,c->>'sourceUrl','CC0-1.0')
      on conflict(provider,provider_song_id) do update set isrcs=excluded.isrcs,metadata=excluded.metadata,synced_at=now();
      for p in select * from jsonb_array_elements(s->'providers') loop
        if p->>'providerSongId' is null or char_length(p->>'providerSongId') not between 1 and 200 then raise exception 'Invalid provider ID';end if;
        insert into song_providers(song_id,provider,provider_song_id,external_url)
          values(target,p->>'provider',p->>'providerSongId',p->>'externalUrl')
          on conflict(song_id,provider) do nothing;
      end loop;
      ids:=array_append(ids,target);
    end loop;
  exception when others then
    return jsonb_build_object('error',case when SQLERRM in('Import 1 to 10 candidates','Invalid discovery candidate','Invalid ISRC',
      'Conflicting identifiers require duplicate review','Identifier belongs to another song','Choose a listed duplicate',
      'Review possible duplicates before importing') then SQLERRM else 'Catalog import failed. No songs changed.' end);
  end;
  return jsonb_build_object('songIds',to_jsonb(ids));
end $$;
revoke all on function ingest_catalog(jsonb) from public,anon;
grant execute on function ingest_catalog(jsonb) to authenticated;

-- Audio rights and availability are independent of a song's external listening links.
create table song_audio_sources (
  song_id text primary key references songs(id) on delete cascade,
  provider text not null check(char_length(trim(provider)) between 1 and 100),
  url text check(url is null or (length(url)<=2000 and url ~ '^https://[^/@[:space:]]+(/|$)')),
  availability text not null default 'unknown' check(availability in('unknown','available','unavailable')),
  licensing_status text not null default 'unreviewed' check(licensing_status in('unreviewed','authorized','rejected')),
  authorization_url text check(authorization_url is null or (length(authorization_url)<=2000 and authorization_url ~ '^https://[^/@[:space:]]+(/|$)')),
  attribution text not null default '' check(char_length(attribution)<=1000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  check(licensing_status<>'authorized' or (url is not null and authorization_url is not null and trim(attribution)<>''))
);
alter table song_audio_sources enable row level security;
revoke all on song_audio_sources from public,anon,authenticated;
grant select(song_id,provider,url,availability,licensing_status,authorization_url,attribution) on song_audio_sources to anon,authenticated;
create policy public_authorized_audio on song_audio_sources for select using(
  availability='available' and licensing_status='authorized');
create policy admin_audio_read on song_audio_sources for select to authenticated using(is_admin());
create trigger audio_admin_audit after insert or update or delete on song_audio_sources
  for each row execute function audit_admin_change();
create function save_audio_source(p_song_id text,p_preview jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not reserve_request('admin') then return jsonb_build_object('error','Too many requests. Try again next minute.');end if;
  begin
    if p_preview is null or jsonb_typeof(p_preview)<>'object' or octet_length(p_preview::text)>10000 then raise exception 'Invalid audio source';end if;
    insert into song_audio_sources(song_id,provider,url,availability,licensing_status,authorization_url,attribution,reviewed_by)
    values(p_song_id,p_preview->>'provider',nullif(p_preview->>'url',''),p_preview->>'availability',p_preview->>'licensingStatus',
      nullif(p_preview->>'authorizationUrl',''),coalesce(p_preview->>'attribution',''),auth.uid())
    on conflict(song_id) do update set provider=excluded.provider,url=excluded.url,availability=excluded.availability,
      licensing_status=excluded.licensing_status,authorization_url=excluded.authorization_url,attribution=excluded.attribution,
      reviewed_by=excluded.reviewed_by,reviewed_at=now();
  exception when others then return jsonb_build_object('error','Audio could not be saved. Authorized audio needs an HTTPS source, authorization and attribution.');end;
  return null;
end $$;
revoke all on function save_audio_source(text,jsonb) from public,anon;
grant execute on function save_audio_source(text,jsonb) to authenticated;

-- Preserve the view's existing columns and append the new projections.
create or replace view song_catalog with (security_invoker=true) as
with ranks as(select id,row_number() over(order by elo_rating desc,id) as global_rank from songs where status='active')
select s.id,s.title,s.normalized_title,s.artist_name,s.normalized_artist_name,s.album_name,s.release_date,s.release_year,
 s.artwork_url,s.duration_ms,s.genre,s.status,s.elo_rating,s.wins,s.losses,s.matchup_count,s.created_at,s.updated_at,
 r.global_rank,case when s.matchup_count>0 then round(100.0*s.wins/s.matchup_count,1) else 0 end as win_percentage,
 coalesce((select jsonb_agg(to_jsonb(p.*) order by p.provider) from song_providers p where p.song_id=s.id),'[]'::jsonb) as providers,
 s.elo_rating-coalesce((select rating from song_rating_snapshots h where h.song_id=s.id and h.snapshot_date<(now() at time zone 'UTC')::date-6 order by h.snapshot_date desc limit 1),1500) as recent_movement,
 s.catalog_managed_fields,s.artwork_source_url,s.artwork_attribution,
 (select jsonb_build_object('provider',a.provider,'url',a.url,'availability',a.availability,'licensing_status',a.licensing_status,
   'authorization_url',a.authorization_url,'attribution',a.attribution) from song_audio_sources a where a.song_id=s.id
   and a.availability='available' and a.licensing_status='authorized') as audio_preview
from songs s left join ranks r on r.id=s.id;

-- Old preview_started rows were outbound clicks, never confirmed playback.
alter table product_event_counts drop constraint product_event_counts_event_check;
insert into product_event_counts(event_day,event,count)
select event_day,'listening_link_clicked',count from product_event_counts where event='preview_started'
on conflict(event_day,event) do update set count=product_event_counts.count+excluded.count;
delete from product_event_counts where event='preview_started';
alter table product_event_counts add constraint product_event_counts_event_check check(event in(
  'landing_view','sign_in_started','daily_view','listening_link_clicked','preview_play_started','preview_play_failed',
  'vote_submitted','share_copied','leaderboard_view','streak_continued'));
create or replace function record_product_event(p_event text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_event='preview_started' then p_event:='listening_link_clicked';end if;
 if p_event not in('landing_view','sign_in_started','daily_view','listening_link_clicked','preview_play_started','preview_play_failed',
   'vote_submitted','share_copied','leaderboard_view','streak_continued') then raise exception 'Invalid event';end if;
 if not reserve_request('analytics') then return;end if;
 delete from product_event_counts where event_day<(now() at time zone 'UTC')::date-90;
 insert into product_event_counts values((now() at time zone 'UTC')::date,p_event,1)
 on conflict(event_day,event) do update set count=product_event_counts.count+1;
end $$;
notify pgrst,'reload schema';
commit;
