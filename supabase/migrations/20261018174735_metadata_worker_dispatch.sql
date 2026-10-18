begin;
-- pg_net is installed in the cluster's postgres database; test databases only validate RPC authorization.
do $$ begin
 if current_database()='postgres' then create extension if not exists pg_net with schema extensions; end if;
end $$;
create or replace function public.dispatch_song_metadata() returns bigint language plpgsql security definer set search_path=public as $$
declare request_id bigint; config metadata_worker_config;
begin
 select * into config from metadata_worker_config where id;
 if config.endpoint is null or exists(select 1 from song_metadata_jobs where status='processing' and lease_until>now()) or not exists(
  select 1 from song_metadata_jobs where (status in ('queued','failed') and attempts<5 and next_attempt_at<=now()) or (status='processing' and lease_until<=now())
 ) then return null; end if;
 select net.http_post(url=>config.endpoint,headers=>jsonb_build_object('Content-Type','application/json','x-metadata-secret',config.secret::text),body=>'{}'::jsonb,timeout_milliseconds=>120000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_song_metadata() from public,anon,authenticated;
grant execute on function public.dispatch_song_metadata() to service_role;
commit;
