begin;
alter table public.song_metadata_jobs add column artwork_permission jsonb;
create or replace function public.authorize_metadata_artwork(p_song_id text,p_evidence text,p_attribution text) returns void language plpgsql security definer set search_path=public as $$
declare details jsonb; cover jsonb;
begin
 if not is_admin() then raise exception 'Admin access required'; end if;
 if p_evidence is null or p_evidence !~ '^https://[^/@[:space:]]+(/|$)' or length(p_evidence)>2000 or length(trim(coalesce(p_attribution,''))) not between 1 and 1000 then raise exception 'Permission evidence and attribution required'; end if;
 select metadata_details into details from songs where id=p_song_id and artwork_url is null for update;
 cover:=details->'artwork';
 if cover is null or cover->>'url' is distinct from 'https://coverartarchive.org/release/'||(details->>'releaseId')||'/front-500' then raise exception 'Review a matched cover first'; end if;
 update song_metadata_jobs set artwork_permission=jsonb_build_object('evidence',p_evidence,'attribution',p_attribution,'reviewer',auth.uid(),'reviewedAt',now()),updated_at=now() where song_id=p_song_id;
 update songs set artwork_url=cover->>'url',artwork_source_url=cover->>'sourceUrl',artwork_attribution=p_attribution where id=p_song_id;
end $$;
revoke all on function public.authorize_metadata_artwork(text,text,text) from public,anon;
grant execute on function public.authorize_metadata_artwork(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
