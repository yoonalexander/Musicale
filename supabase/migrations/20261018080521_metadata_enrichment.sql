begin;
alter table public.songs add column metadata_details jsonb;
create table public.song_metadata_jobs (
 song_id text primary key references public.songs(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','processing','enriched','review','unmatched','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease uuid, lease_until timestamptz,
 snapshot jsonb, candidates jsonb not null default '[]',
 error text, updated_at timestamptz not null default now()
);
create index metadata_pending on public.song_metadata_jobs(next_attempt_at) where status in ('queued','failed','processing');
alter table public.song_metadata_jobs enable row level security;
revoke all on public.song_metadata_jobs from public,anon,authenticated;
grant select on public.song_metadata_jobs to authenticated;
grant all on public.song_metadata_jobs to service_role;
create policy metadata_admin_read on public.song_metadata_jobs for select to authenticated using(public.is_admin());

create function public.queue_song_metadata() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or new.title is distinct from old.title or new.artist_name is distinct from old.artist_name then
  insert into song_metadata_jobs(song_id) values(new.id)
  on conflict(song_id) do update set status='queued',attempts=0,lease=null,lease_until=null,next_attempt_at=now(),updated_at=now();
 end if;
 return new;
end $$;
revoke all on function public.queue_song_metadata() from public,anon,authenticated;
create trigger queue_song_metadata after insert or update of title,artist_name on public.songs for each row execute function public.queue_song_metadata();
insert into public.song_metadata_jobs(song_id) select id from public.songs where artwork_url is null or release_date is null or genre is null or album_name in ('Single','Unknown','');

create function public.claim_song_metadata(p_song_id text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare job song_metadata_jobs; s songs; token uuid:=gen_random_uuid();
begin
 if not is_admin() and current_setting('role')<>'service_role' then raise exception 'Admin access required'; end if;
 select * into job from song_metadata_jobs where (p_song_id is null or song_id=p_song_id)
  and ((status in ('queued','failed') and next_attempt_at<=now() and attempts<5) or (status='processing' and lease_until<now()))
  order by next_attempt_at,song_id for update skip locked limit 1;
 if not found then return null; end if;
 select * into s from songs where id=job.song_id;
 update song_metadata_jobs set status='processing',lease=token,lease_until=now()+interval '5 minutes',attempts=attempts+1,
  snapshot=to_jsonb(s),updated_at=now() where song_id=s.id;
 return jsonb_build_object('song',to_jsonb(s)||jsonb_build_object('isrcs',coalesce((select jsonb_agg(code) from catalog_sources c cross join unnest(c.isrcs) code where c.song_id=s.id),'[]'::jsonb),
  'recording_id',(select provider_song_id from song_providers where song_id=s.id and provider='musicbrainz')),'lease',token);
end $$;
revoke all on function public.claim_song_metadata(text) from public,anon;
grant execute on function public.claim_song_metadata(text) to authenticated,service_role;

create function public.finish_song_metadata(p_song_id text,p_lease uuid,p_status text,p_candidates jsonb default '[]',p_selected jsonb default null,p_error text default null) returns void language plpgsql security definer set search_path=public as $$
declare job song_metadata_jobs; s songs; original text;
begin
 if not is_admin() and current_setting('role')<>'service_role' then raise exception 'Admin access required'; end if;
 if p_status not in ('enriched','review','unmatched','failed') or jsonb_typeof(p_candidates) is distinct from 'array' or octet_length(p_candidates::text)>500000 then raise exception 'Invalid metadata result'; end if;
 select * into job from song_metadata_jobs where song_id=p_song_id for update;
 if p_lease is null or job.song_id is null or job.lease is distinct from p_lease or job.status<>'processing' then raise exception 'Metadata lease expired'; end if;
 select * into s from songs where id=p_song_id for update;
 if s.title is distinct from job.snapshot->>'title' or s.artist_name is distinct from job.snapshot->>'artist_name' then
  update song_metadata_jobs set status='queued',lease=null,lease_until=null,next_attempt_at=now() where song_id=p_song_id; return;
 end if;
 if p_status='enriched' then
  if p_selected is null or (p_selected->>'confidence')::numeric not between 0 and 1 or p_selected->>'recordingId' is null or p_selected->>'releaseId' is null then raise exception 'Invalid metadata selection'; end if;
  perform (p_selected->>'recordingId')::uuid,(p_selected->>'releaseId')::uuid,(p_selected->>'releaseGroupId')::uuid;
  original:=p_selected->>'originalDate';
  update songs set
   album_name=case when album_name in ('Single','Unknown','') and album_name=job.snapshot->>'album_name' then left(p_selected->>'albumName',200) else album_name end,
   release_date=case when release_date is null and original ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and left(original,4)::int=release_year then original::date else release_date end,
   duration_ms=case when duration_ms is null and (p_selected->>'durationMs')::int between 1000 and 86400000 then (p_selected->>'durationMs')::int else duration_ms end,
   metadata_details=p_selected||jsonb_build_object('source','musicbrainz','license','CC0-1.0','syncedAt',now())||case when metadata_details ? 'artworkPermission' then jsonb_build_object('artworkPermission',metadata_details->'artworkPermission') else '{}'::jsonb end
  where id=p_song_id;
 end if;
 update song_metadata_jobs set status=p_status,candidates=p_candidates,error=left(p_error,500),lease=null,lease_until=null,
  next_attempt_at=now()+make_interval(mins=>least(1440,(power(2,attempts)*5)::int)),updated_at=now() where song_id=p_song_id;
end $$;
revoke all on function public.finish_song_metadata(text,uuid,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.finish_song_metadata(text,uuid,text,jsonb,jsonb,text) to authenticated,service_role;

create function public.retry_song_metadata(p_song_id text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'Admin access required'; end if;
 update song_metadata_jobs set status='queued',attempts=0,next_attempt_at=now(),updated_at=now() where (p_song_id is null or song_id=p_song_id) and status<>'processing';
end $$;
revoke all on function public.retry_song_metadata(text) from public,anon;
grant execute on function public.retry_song_metadata(text) to authenticated;

-- The existing discovery importer and scheduled worker share the same cross-instance limit.
create or replace function public.reserve_catalog_provider_call() returns boolean language plpgsql security definer set search_path=public as $$
declare claimed text;
begin
 if not is_admin() and current_setting('role')<>'service_role' then raise exception 'Admin access required';end if;
 insert into catalog_request_slots values('musicbrainz',clock_timestamp()+interval '1100 milliseconds')
 on conflict(provider) do update set next_at=clock_timestamp()+interval '1100 milliseconds'
 where catalog_request_slots.next_at<=clock_timestamp() returning provider into claimed;
 return claimed is not null;
end $$;
grant execute on function public.reserve_catalog_provider_call() to service_role;

create function public.authorize_metadata_artwork(p_song_id text,p_evidence text,p_attribution text) returns void language plpgsql security definer set search_path=public as $$
declare details jsonb; cover jsonb;
begin
 if not is_admin() then raise exception 'Admin access required'; end if;
 if p_evidence is null or p_evidence !~ '^https://[^/@[:space:]]+(/|$)' or length(p_evidence)>2000 or length(trim(coalesce(p_attribution,''))) not between 1 and 1000 then raise exception 'Permission evidence and attribution required'; end if;
 select metadata_details into details from songs where id=p_song_id and artwork_url is null for update;
 cover:=details->'artwork';
 if cover is null or cover->>'url' is distinct from 'https://coverartarchive.org/release/'||(details->>'releaseId')||'/front-500' then raise exception 'Review a matched cover first'; end if;
 update songs set artwork_url=cover->>'url',artwork_source_url=cover->>'sourceUrl',artwork_attribution=p_attribution,
 metadata_details=details||jsonb_build_object('artworkPermission',jsonb_build_object('evidence',p_evidence,'attribution',p_attribution,'reviewer',auth.uid(),'reviewedAt',now())) where id=p_song_id;
end $$;
revoke all on function public.authorize_metadata_artwork(text,text,text) from public,anon;
grant execute on function public.authorize_metadata_artwork(text,text,text) to authenticated;

create table public.metadata_worker_config (
 id boolean primary key default true check(id), endpoint text, secret uuid not null default gen_random_uuid()
);
alter table public.metadata_worker_config enable row level security;
revoke all on public.metadata_worker_config from public,anon,authenticated;
grant select on public.metadata_worker_config to service_role;
insert into public.metadata_worker_config(id) values(true);

-- Append to the existing view without changing its column order or public contracts.
do $$ declare definition text; begin
 select pg_get_viewdef('public.song_catalog'::regclass,true) into definition;
 execute 'create or replace view public.song_catalog with (security_invoker=true) as select c.*,s.metadata_details from ('||rtrim(definition,E';\n ')||') c join public.songs s on s.id=c.id';
end $$;
notify pgrst,'reload schema';
commit;
