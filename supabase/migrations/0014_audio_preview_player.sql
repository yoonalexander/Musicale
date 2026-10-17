begin;
alter table song_audio_sources drop constraint song_audio_sources_url_check;
alter table song_audio_sources add constraint song_audio_sources_url_check check(url is null or
  (length(url)<=2000 and url ~ '^https://[^/@[:space:]]+(/|$)') or url ~ '^/audio/[a-z0-9-]+[.]mp3$');
alter table song_audio_sources add column provider_recording_id text check(char_length(provider_recording_id) between 1 and 200);
alter table song_audio_sources add column start_seconds numeric not null default 0 check(start_seconds between 0 and 86400);
alter table song_audio_sources add column license_url text check(license_url is null or (length(license_url)<=2000 and license_url ~ '^https://[^/@[:space:]]+(/|$)'));
alter table song_audio_sources add column auto_managed boolean not null default false;
alter table song_audio_sources add column synced_at timestamptz;
create unique index audio_recording_identity on song_audio_sources(provider,provider_recording_id) where provider_recording_id is not null;
grant select(provider_recording_id,start_seconds,license_url) on song_audio_sources to anon,authenticated;

create or replace function save_audio_source(p_song_id text,p_preview jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not reserve_request('admin') then return jsonb_build_object('error','Too many requests. Try again next minute.');end if;
  begin
    if p_preview is null or jsonb_typeof(p_preview)<>'object' or octet_length(p_preview::text)>10000 then raise exception 'Invalid audio source';end if;
    insert into song_audio_sources(song_id,provider,url,availability,licensing_status,authorization_url,attribution,reviewed_by,start_seconds,license_url)
    values(p_song_id,p_preview->>'provider',nullif(p_preview->>'url',''),p_preview->>'availability',p_preview->>'licensingStatus',
      nullif(p_preview->>'authorizationUrl',''),coalesce(p_preview->>'attribution',''),auth.uid(),coalesce((p_preview->>'startSeconds')::numeric,0),nullif(p_preview->>'licenseUrl',''))
    on conflict(song_id) do update set provider=excluded.provider,url=excluded.url,availability=excluded.availability,
      licensing_status=excluded.licensing_status,authorization_url=excluded.authorization_url,attribution=excluded.attribution,
      reviewed_by=excluded.reviewed_by,reviewed_at=now(),start_seconds=excluded.start_seconds,license_url=excluded.license_url,
      auto_managed=false,provider_recording_id=null,synced_at=null;
  exception when others then return jsonb_build_object('error','Audio could not be saved. Authorized audio needs an HTTPS source, authorization and attribution.');end;
  return null;
end $$;

create function attach_discovered_previews(p_candidates jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb;n integer:=0;changed integer;
begin
  if not reserve_request('admin') then return jsonb_build_object('error','Too many requests. Try again next minute.');end if;
  begin
    if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>100
      or octet_length(p_candidates::text)>200000 then raise exception 'Invalid audio candidates';end if;
    lock table songs,song_audio_sources in share row exclusive mode;
    for c in select * from jsonb_array_elements(p_candidates) loop
      if c->>'provider' is distinct from 'wikimedia_commons' or coalesce(c->>'providerRecordingId','') !~ '^[0-9]{1,20}$'
        or c->>'url' is distinct from '/audio/'||(c->>'providerRecordingId')||'.mp3'
        or coalesce(c->>'authorizationUrl','') !~ '^https://commons[.]wikimedia[.]org/wiki/File:'
        or c->>'licenseUrl' is distinct from 'https://creativecommons.org/licenses/by/3.0'
        or c->>'availability' is distinct from 'available' or c->>'licensingStatus' is distinct from 'authorized'
        then raise exception 'Invalid authorized source';end if;
      insert into song_audio_sources(song_id,provider,provider_recording_id,url,availability,licensing_status,authorization_url,
        license_url,attribution,start_seconds,reviewed_by,auto_managed,synced_at)
      values(c->>'songId','wikimedia_commons',c->>'providerRecordingId',c->>'url','available','authorized',c->>'authorizationUrl',
        c->>'licenseUrl',c->>'attribution',coalesce((c->>'startSeconds')::numeric,0),auth.uid(),true,now())
      on conflict(song_id) do update set provider=excluded.provider,provider_recording_id=excluded.provider_recording_id,
        url=excluded.url,authorization_url=excluded.authorization_url,license_url=excluded.license_url,attribution=excluded.attribution,
        start_seconds=excluded.start_seconds,synced_at=now(),reviewed_by=excluded.reviewed_by,reviewed_at=now()
      where song_audio_sources.auto_managed and song_audio_sources.licensing_status='authorized'
        and song_audio_sources.availability='available';
      get diagnostics changed=row_count;n:=n+changed;
    end loop;
  exception when others then return jsonb_build_object('error','Audio discovery was not saved. Review duplicate recording identities or changed source permissions.');end;
  return jsonb_build_object('attached',n);
end $$;
revoke all on function attach_discovered_previews(jsonb) from public,anon;
grant execute on function attach_discovered_previews(jsonb) to authenticated;

-- Keep all existing public columns and append the reviewed preview fields inside its JSON.
create or replace view song_catalog with (security_invoker=true) as
with ranks as(select id,row_number() over(order by elo_rating desc,id) as global_rank from songs where status='active')
select s.id,s.title,s.normalized_title,s.artist_name,s.normalized_artist_name,s.album_name,s.release_date,s.release_year,
 s.artwork_url,s.duration_ms,s.genre,s.status,s.elo_rating,s.wins,s.losses,s.matchup_count,s.created_at,s.updated_at,
 r.global_rank,case when s.matchup_count>0 then round(100.0*s.wins/s.matchup_count,1) else 0 end as win_percentage,
 coalesce((select jsonb_agg(to_jsonb(p.*) order by p.provider) from song_providers p where p.song_id=s.id),'[]'::jsonb) as providers,
 s.elo_rating-coalesce((select rating from song_rating_snapshots h where h.song_id=s.id and h.snapshot_date<(now() at time zone 'UTC')::date-6 order by h.snapshot_date desc limit 1),1500) as recent_movement,
 s.catalog_managed_fields,s.artwork_source_url,s.artwork_attribution,
 (select jsonb_build_object('provider',a.provider,'url',a.url,'availability',a.availability,'licensing_status',a.licensing_status,
   'authorization_url',a.authorization_url,'attribution',a.attribution,'start_seconds',a.start_seconds,'license_url',a.license_url,
   'provider_recording_id',a.provider_recording_id) from song_audio_sources a where a.song_id=s.id
   and a.availability='available' and a.licensing_status='authorized') as audio_preview
from songs s left join ranks r on r.id=s.id;

alter table rank_comparisons add column preview_only boolean not null default false;
create function prepare_rank_pair(p_preview_only boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();current_id uuid;last_a text;last_b text;a text;b text;
begin
  if u is null then raise exception 'Authentication required';end if;
  perform pg_advisory_xact_lock(hashtextextended('rank:'||u::text,0));
  update rank_comparisons set status=case when expires_at<=clock_timestamp() then 'expired' else 'unavailable' end
    where user_id=u and status='pending' and (expires_at<=clock_timestamp() or not rank_song_playable(song_a_id) or not rank_song_playable(song_b_id)
      or preview_only is distinct from p_preview_only
      or (p_preview_only and (select count(*) from song_audio_sources where song_id in(song_a_id,song_b_id) and availability='available' and licensing_status='authorized')<2));
  select id into current_id from rank_comparisons where user_id=u and status='pending';
  if current_id is not null then return current_id;end if;
  if (select count(*) from songs where rank_song_playable(id) and (not p_preview_only or exists(
    select 1 from song_audio_sources a where a.song_id=songs.id and a.availability='available' and a.licensing_status='authorized')))<4 then return null;end if;
  select song_a_id,song_b_id into last_a,last_b from rank_comparisons where user_id=u and status='voted' order by voted_at desc,id desc limit 1;
  -- shortcut: preserve the modest-catalog pair sampler; use indexed sampling before a large-library rollout.
  with eligible as materialized(select id from songs where rank_song_playable(id) and (not p_preview_only or exists(
    select 1 from song_audio_sources a where a.song_id=songs.id and a.availability='available' and a.licensing_status='authorized')))
  select x.id,y.id into a,b from eligible x join eligible y on x.id<y.id
    where (last_a is null or (x.id not in(last_a,last_b) and y.id not in(last_a,last_b)))
      and not exists(select 1 from rank_comparisons c where c.user_id=u and c.status='voted'
        and c.song_a_id=x.id and c.song_b_id=y.id and c.voted_at>clock_timestamp()-interval '10 minutes')
    order by random() limit 1;
  if a is null then return null;end if;
  insert into rank_comparisons(user_id,song_a_id,song_b_id,preview_only) values(u,a,b,p_preview_only) returning id into current_id;
  return current_id;
end $$;
revoke all on function prepare_rank_pair(boolean) from public,anon,authenticated;
create or replace function prepare_rank_pair() returns uuid language plpgsql security definer set search_path=public as $$
begin
  return prepare_rank_pair(coalesce((select preview_only from rank_comparisons where user_id=auth.uid() and status='voted' order by voted_at desc,id desc limit 1),false));
end $$;
create or replace function start_rank_pair() returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not reserve_request('rank') then return jsonb_build_object('error','Too many Rank requests. Try again next minute.');end if;
  begin
    lock table daily_matchups,songs,votes,rating_events,rank_comparisons,rank_votes in row exclusive mode;
    return jsonb_build_object('comparisonId',prepare_rank_pair(false));
  exception when others then return jsonb_build_object('error','Could not prepare a pair. Please retry.');end;
end $$;
create function start_preview_rank_pair() returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not reserve_request('rank') then return jsonb_build_object('error','Too many Rank requests. Try again next minute.');end if;
  begin
    lock table daily_matchups,songs,votes,rating_events,rank_comparisons,rank_votes in row exclusive mode;
    return jsonb_build_object('comparisonId',prepare_rank_pair(true));
  exception when others then return jsonb_build_object('error','Could not prepare a pair. Please retry.');end;
end $$;
revoke all on function start_preview_rank_pair() from public,anon;
grant execute on function start_preview_rank_pair() to authenticated;
notify pgrst,'reload schema';
commit;
