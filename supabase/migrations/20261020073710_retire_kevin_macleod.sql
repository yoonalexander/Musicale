-- Retire these recordings without deleting votes, ratings, or saved run history.
update public.songs
set status = 'disabled'
where lower(regexp_replace(artist_name, '\s+', ' ', 'g')) = 'kevin macleod'
  and status <> 'disabled';

-- Keep historical votes, but remove retired recordings from the public archive.
update public.daily_matchups m
set featured = false
where m.featured
  and exists (
    select 1 from public.songs s
    where lower(regexp_replace(s.artist_name, '\s+', ' ', 'g')) = 'kevin macleod'
      and s.id in (m.song_a_id, m.song_b_id)
  );

update public.rank_comparisons
set status = 'unavailable'
where status = 'pending'
  and exists (
    select 1 from public.songs s
    where s.status = 'disabled'
      and s.id in (rank_comparisons.song_a_id, rank_comparisons.song_b_id)
  );
