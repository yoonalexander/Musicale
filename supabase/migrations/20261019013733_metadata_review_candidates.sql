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
  'recording_id',coalesce((select provider_song_id from song_providers where song_id=s.id and provider='musicbrainz'),s.metadata_details->>'recordingId')),'candidates',job.candidates,'lease',token);
end $$;
revoke all on function public.claim_song_metadata(text) from public,anon;
grant execute on function public.claim_song_metadata(text) to authenticated,service_role;
commit;
