begin;
create or replace function public.review_metadata_artwork(p_song_id text,p_status text,p_basis text default null,p_evidence text default null,p_scope text default null,p_attribution text default null) returns void language plpgsql security definer set search_path=public as $$
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
  if cover is null or image_id is null or image_id !~ '^[0-9]+$' or cover->>'url' is null or image_release is null or image_release !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or cover->>'url' !~ ('^https://coverartarchive[.]org/release/'||image_release||'/'||image_id||'-500[.](jpg|jpeg|png)$') then raise exception 'Refresh artwork to identify the exact image before permission review';end if;
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

-- Enable only after the authenticated production worker has been verified.
do $$ begin
 if current_database()='postgres' then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('musicale-metadata-enrichment','0 7 * * *','select public.dispatch_song_metadata()');
 end if;
end $$;
commit;
