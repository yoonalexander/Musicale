begin;
-- Accept authorized audio alongside official links, preserving immutable-day and atomic-vote logic.
create or replace function validate_matchup() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='UPDATE' and new.status='cancelled' and old.status<>'cancelled'
    and (old.starts_at<=now() or exists(select 1 from votes where matchup_id=old.id)) then
    raise exception 'Only future unvoted matchups can be cancelled';
  end if;
  if TG_OP='UPDATE' and (old.starts_at<=now() or exists(select 1 from votes where matchup_id=old.id))
    and (new.song_a_id<>old.song_a_id or new.song_b_id<>old.song_b_id or new.matchup_day<>old.matchup_day
      or new.starts_at<>old.starts_at or new.ends_at<>old.ends_at) then
    raise exception 'Only future unvoted matchups can be replaced';
  end if;
  if TG_OP='INSERT' or new.song_a_id<>old.song_a_id or new.song_b_id<>old.song_b_id then
    if (select count(*) from songs s where s.id in(new.song_a_id,new.song_b_id) and s.status='active'
      and (exists(select 1 from song_providers p where p.song_id=s.id and p.provider in('youtube','spotify','apple_music') and p.external_url is not null) or exists(select 1 from song_audio_sources a where a.song_id=s.id and a.availability='available' and a.licensing_status='authorized')))<>2 then
      raise exception 'Choose two active songs with playback providers';
    end if;
  end if;
  return new;
end $$;

create or replace function process_daily_vote(p_matchup_id uuid,p_selected_song_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid();m daily_matchups%rowtype;winner songs%rowtype;loser songs%rowtype;
  expected numeric;delta int;k int;vid uuid;day date;new_streak int;
begin
  if u is null then raise exception 'Authentication required';end if;
  select * into m from daily_matchups where id=p_matchup_id for update;
  if not found or now()<m.starts_at or now()>=m.ends_at or m.status not in('scheduled','active') then
    raise exception 'This matchup is not active';end if;
  if p_selected_song_id is null or p_selected_song_id not in(m.song_a_id,m.song_b_id) then
    raise exception 'Selected song is not in this matchup';end if;
  if exists(select 1 from votes where user_id=u and matchup_id=m.id) then raise exception 'You already voted in this matchup';end if;
  perform id from songs where id in(m.song_a_id,m.song_b_id) order by id for no key update;
  select * into winner from songs where id=p_selected_song_id;
  select * into loser from songs where id=case when p_selected_song_id=m.song_a_id then m.song_b_id else m.song_a_id end;
  if winner.status<>'active' or loser.status<>'active' then raise exception 'Both songs must be active';end if;
  if not rank_song_playable(winner.id) or not rank_song_playable(loser.id) then
    raise exception 'Playback is unavailable for this matchup';end if;
  select elo_k_factor into k from app_settings where id=true;
  expected:=1/(1+power(10,(loser.elo_rating-winner.elo_rating)/400));delta:=round(k*(1-expected));
  update songs set elo_rating=elo_rating+delta,wins=wins+1,matchup_count=matchup_count+1,updated_at=now() where id=winner.id;
  update songs set elo_rating=elo_rating-delta,losses=losses+1,matchup_count=matchup_count+1,updated_at=now() where id=loser.id;
  update daily_matchups set song_a_votes=song_a_votes+(winner.id=m.song_a_id)::int,
    song_b_votes=song_b_votes+(winner.id=m.song_b_id)::int,status='active',updated_at=now() where id=m.id;
  insert into votes(user_id,matchup_id,song_a_id,song_b_id,selected_song_id,rejected_song_id,
    selected_rating_before,rejected_rating_before,selected_rating_after,rejected_rating_after,expected_score,rating_delta)
  values(u,m.id,m.song_a_id,m.song_b_id,winner.id,loser.id,winner.elo_rating,loser.elo_rating,
    winner.elo_rating+delta,loser.elo_rating-delta,expected,delta) returning id into vid;
  day:=m.matchup_day;insert into user_daily_activity(user_id,activity_day,vote_id) values(u,day,vid);
  select case when last_vote_day=day then current_streak when last_vote_day=day-1 then current_streak+1 else 1 end
    into new_streak from profiles where user_id=u for update;
  update profiles set last_vote_day=day,current_streak=new_streak,longest_streak=greatest(longest_streak,new_streak),
    total_votes=total_votes+1,updated_at=now() where user_id=u;
  insert into rating_events(vote_id,winner_song_id,loser_song_id,winner_before,loser_before,winner_after,loser_after,k_factor)
  values(vid,winner.id,loser.id,winner.elo_rating,loser.elo_rating,winner.elo_rating+delta,loser.elo_rating-delta,k);
  insert into song_rating_snapshots(song_id,rating,snapshot_date)
  select id,elo_rating,day from songs where id in(winner.id,loser.id)
  on conflict(song_id,snapshot_date) do update set rating=excluded.rating,created_at=now();
  return jsonb_build_object('voteId',vid,'ratingDelta',delta,'currentStreak',new_streak);
exception when unique_violation then raise exception 'You already voted in this matchup';end $$;

create or replace function get_today_matchup() returns table(
  matchup_id uuid,matchup_number bigint,matchup_day date,starts_at timestamptz,ends_at timestamptz,
  song_a jsonb,song_b jsonb,song_a_votes int,song_b_votes int,total_votes int,selected_song_id text
) language sql stable security definer set search_path=public as $$
  select m.id,m.matchup_number,m.matchup_day,m.starts_at,m.ends_at,
    to_jsonb(a.*)||jsonb_build_object('providers',coalesce((select jsonb_agg(to_jsonb(p.*)) from song_providers p where p.song_id=a.id),'[]'::jsonb)),
    to_jsonb(b.*)||jsonb_build_object('providers',coalesce((select jsonb_agg(to_jsonb(p.*)) from song_providers p where p.song_id=b.id),'[]'::jsonb)),
    case when v.id is not null then m.song_a_votes end,case when v.id is not null then m.song_b_votes end,
    case when v.id is not null then m.song_a_votes+m.song_b_votes end,v.selected_song_id
  from daily_matchups m join songs a on a.id=m.song_a_id join songs b on b.id=m.song_b_id
  left join votes v on v.matchup_id=m.id and v.user_id=auth.uid()
  where now()>=m.starts_at and now()<m.ends_at and m.status in('scheduled','active')
    and a.status='active' and b.status='active'
    and rank_song_playable(a.id)
    and rank_song_playable(b.id) limit 1
$$;

notify pgrst,'reload schema';
commit;
