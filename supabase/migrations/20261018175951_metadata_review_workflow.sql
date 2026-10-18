begin;
create or replace function public.claim_song_metadata(p_song_id text default null) returns jsonb language plpgsql security definer set search_path=public as $$
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
 return jsonb_build_object('song',to_jsonb(s)||jsonb_build_object('isrcs',coalesce((select jsonb_agg(code) from catalog_sources c cross join unnest(c.isrcs) code where c.song_id=s.id),'[]'::jsonb)||coalesce(s.metadata_details->'isrcs','[]'::jsonb),
  'recording_id',coalesce((select provider_song_id from song_providers where song_id=s.id and provider='musicbrainz'),s.metadata_details->>'recordingId')),'lease',token);
end $$;
revoke all on function public.claim_song_metadata(text) from public,anon;
grant execute on function public.claim_song_metadata(text) to authenticated,service_role;

create or replace function public.finish_song_metadata(p_song_id text,p_lease uuid,p_status text,p_candidates jsonb default '[]',p_selected jsonb default null,p_error text default null) returns void language plpgsql security definer set search_path=public as $$
declare job song_metadata_jobs; s songs; original text;
begin
 if not is_admin() and current_setting('role')<>'service_role' then raise exception 'Admin access required'; end if;
 if p_status not in ('enriched','review','unmatched','failed') or jsonb_typeof(p_candidates) is distinct from 'array' or octet_length(p_candidates::text)>500000 then raise exception 'Invalid metadata result'; end if;
 select * into s from songs where id=p_song_id for update;
 select * into job from song_metadata_jobs where song_id=p_song_id for update;
 if p_lease is null or job.song_id is null or job.lease is distinct from p_lease or job.status<>'processing' then raise exception 'Metadata lease expired'; end if;
 if s.title is distinct from job.snapshot->>'title' or s.artist_name is distinct from job.snapshot->>'artist_name' then
  update song_metadata_jobs set status='queued',lease=null,lease_until=null,next_attempt_at=now() where song_id=p_song_id; return;
 end if;
 if p_status='enriched' or (p_status='failed' and p_selected is not null) then
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


create function public.review_metadata_artwork(p_song_id text,p_status text,p_basis text default null,p_evidence text default null,p_scope text default null,p_attribution text default null) returns void language plpgsql security definer set search_path=public as $$
declare details jsonb; cover jsonb; permission jsonb; image_release text; image_id text; s songs;
begin
 if not is_admin() then raise exception 'Admin access required';end if;
 if p_status is null or p_status not in ('authorized','rejected','pending') then raise exception 'Choose a review decision';end if;
 select * into s from songs where id=p_song_id for update;
 select artwork_permission into permission from song_metadata_jobs where song_id=p_song_id for update;
 if s.id is null then raise exception 'Song unavailable';end if;
 cover:=s.metadata_details->'artwork';
 if p_status='authorized' then
  if s.artwork_url is not null then raise exception 'Existing artwork is preserved; use the song editor for overrides';end if;
  image_release:=coalesce(cover->>'releaseId',s.metadata_details->>'releaseId');image_id:=cover->>'imageId';
  if cover is null or image_id is null or image_id !~ '^[0-9]+$' or cover->>'url' !~ ('^https://coverartarchive[.]org/release/'||image_release||'/'||image_id||'-500[.](jpg|jpeg|png)$') then raise exception 'Refresh artwork to identify the exact image before permission review';end if;
  if p_basis is null or p_basis not in ('direct_permission','open_license','public_domain','owned') or p_evidence is null or p_evidence !~ '^https://[^/@[:space:]]+(/|$)' or length(p_evidence)>2000
    or p_evidence ~ '^https://(www[.])?(musicbrainz[.]org|coverartarchive[.]org)(/|$)' or length(trim(coalesce(p_scope,''))) not between 20 and 2000 or length(trim(coalesce(p_attribution,''))) not between 1 and 1000 then raise exception 'Document rights for this exact image and Musicale use; availability or attribution alone is insufficient';end if;
  update songs set artwork_url=cover->>'url',artwork_source_url=cover->>'sourceUrl',artwork_attribution=p_attribution where id=p_song_id;
 elsif s.artwork_url=permission->>'artworkUrl' then
  update songs set artwork_url=null,artwork_source_url=null,artwork_attribution=null where id=p_song_id;
 end if;
 update song_metadata_jobs set artwork_permission=jsonb_build_object('status',p_status,'basis',p_basis,'evidence',p_evidence,'scope',p_scope,'attribution',p_attribution,'artworkUrl',cover->>'url','imageId',cover->>'imageId','reviewer',auth.uid(),'reviewedAt',now()),updated_at=now() where song_id=p_song_id;
end $$;
revoke all on function public.review_metadata_artwork(text,text,text,text,text,text) from public,anon;
grant execute on function public.review_metadata_artwork(text,text,text,text,text,text) to authenticated;
-- Retire the older approval RPC, which accepted a source link without an image-specific rights decision.
revoke all on function public.authorize_metadata_artwork(text,text,text) from public,anon,authenticated;
create function public.apply_reviewed_metadata_fields(p_song_id text,p_recording_id uuid,p_expected_year integer,p_expected_album text,p_album boolean,p_year boolean) returns void language plpgsql security definer set search_path=public as $$
declare s songs; details jsonb; original text;
begin
 if not is_admin() then raise exception 'Admin access required';end if;
 select * into s from songs where id=p_song_id for update;details:=s.metadata_details;original:=details->>'originalDate';
 if details->>'recordingId' is distinct from p_recording_id::text or details->>'reviewedByAdmin' is distinct from 'true' or s.release_year is distinct from p_expected_year or s.album_name is distinct from p_expected_album then raise exception 'Metadata changed during review';end if;
 if p_year and (original is null or left(original,4)::int not between 1860 and 2200) then raise exception 'No valid original year';end if;
 update songs set album_name=case when p_album then left(details->>'albumName',200) else album_name end,
 release_year=case when p_year then left(original,4)::int else release_year end,
 release_date=case when p_year then case when original ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then original::date end else release_date end where id=p_song_id;
end $$;
revoke all on function public.apply_reviewed_metadata_fields(text,uuid,integer,text,boolean,boolean) from public,anon;
grant execute on function public.apply_reviewed_metadata_fields(text,uuid,integer,text,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
