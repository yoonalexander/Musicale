begin;

-- 0011 is reserved for the parallel operations migration when its branch is integrated.
alter table request_budgets drop constraint request_budgets_action_check;
alter table request_budgets add constraint request_budgets_action_check
  check(action in('vote','admin','profile','analytics','rank'));
create or replace function reserve_request(p_action text) returns boolean language plpgsql security definer set search_path=public as $$
declare n int;budget int;u uuid:=auth.uid();
begin
  if u is null then raise exception 'Authentication required';end if;
  budget:=case p_action when 'vote' then 10 when 'admin' then 30 when 'profile' then 5 when 'analytics' then 30 when 'rank' then 30 end;
  if budget is null then raise exception 'Invalid request category';end if;
  if p_action='admin' and not is_admin() then raise exception 'Admin access required';end if;
  delete from request_budgets where window_start<now()-interval '7 days';
  insert into request_budgets values(u,p_action,date_trunc('minute',now()),1)
  on conflict(user_id,action,window_start) do update set attempts=least(request_budgets.attempts+1,10000)
  returning attempts into n;
  return n<=budget;
end $$;

create table rank_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_a_id text not null references songs(id),song_b_id text not null references songs(id),
  status text not null default 'pending' check(status in('pending','voted','expired','unavailable')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
  voted_at timestamptz,
  check(song_a_id<song_b_id),check(expires_at>created_at),
  check((status='voted')=(voted_at is not null))
);
create unique index rank_one_pending on rank_comparisons(user_id) where status='pending';
create index rank_comparisons_history on rank_comparisons(user_id,voted_at desc) where status='voted';
create table rank_votes (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null unique references rank_comparisons(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_song_id text not null references songs(id),rejected_song_id text not null references songs(id),
  selected_rating_before numeric not null,rejected_rating_before numeric not null,
  selected_rating_after numeric not null,rejected_rating_after numeric not null,
  expected_score numeric not null,rating_delta integer not null check(rating_delta>=0),
  created_at timestamptz not null default clock_timestamp(),
  check(selected_song_id<>rejected_song_id),
  check(selected_rating_after-selected_rating_before=rating_delta and rejected_rating_before-rejected_rating_after=rating_delta)
);
create index rank_votes_history on rank_votes(user_id,created_at desc,id);
alter table rank_comparisons enable row level security;
alter table rank_votes enable row level security;
revoke all on rank_comparisons,rank_votes from public,anon,authenticated;
grant select on rank_comparisons,rank_votes to authenticated;
create policy rank_own_comparisons on rank_comparisons for select using(user_id=auth.uid() or is_admin());
create policy rank_own_votes on rank_votes for select using(user_id=auth.uid() or is_admin());

alter table rating_events alter column vote_id drop not null;
alter table rating_events add column rank_vote_id uuid unique references rank_votes(id) on delete cascade;
alter table rating_events add constraint one_vote_source check(num_nonnulls(vote_id,rank_vote_id)=1);
create sequence rating_event_order_seq;
revoke all on sequence rating_event_order_seq from public,anon,authenticated;
alter table rating_events add column event_order bigint;

-- Legacy transaction timestamps need not reflect song-lock acquisition order. Recover a causal order from recorded states.
do $$
declare e rating_events;
begin
  create temporary table legacy_rating_order(song_id text primary key,rating numeric not null) on commit drop;
  insert into legacy_rating_order select id,1500 from songs;
  loop
    select r.* into e from rating_events r
      join legacy_rating_order w on w.song_id=r.winner_song_id and w.rating=r.winner_before
      join legacy_rating_order l on l.song_id=r.loser_song_id and l.rating=r.loser_before
      where r.event_order is null order by r.created_at,r.id limit 1;
    if not found then
      if exists(select 1 from rating_events where event_order is null) then
        raise exception 'Existing rating history could not be ordered consistently. Migration stopped';
      end if;
      exit;
    end if;
    update rating_events set event_order=nextval('rating_event_order_seq') where id=e.id;
    update legacy_rating_order set rating=case song_id when e.winner_song_id then e.winner_after else e.loser_after end
      where song_id in(e.winner_song_id,e.loser_song_id);
  end loop;
end $$;
alter table rating_events alter column event_order set not null;
alter table rating_events alter column event_order set default nextval('rating_event_order_seq');
alter table rating_events add constraint rating_event_order_unique unique(event_order);

create function rank_song_playable(p_id text) returns boolean language sql stable set search_path=public as $$
  select exists(select 1 from songs s where s.id=p_id and s.status='active' and (
    exists(select 1 from song_providers p where p.song_id=s.id and p.provider in('youtube','spotify','apple_music') and p.external_url is not null)
    or exists(select 1 from song_audio_sources a where a.song_id=s.id and a.availability='available' and a.licensing_status='authorized')))
$$;
revoke all on function rank_song_playable(text) from public,anon,authenticated;

create function prepare_rank_pair() returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();current_id uuid;last_a text;last_b text;a text;b text;
begin
  if u is null then raise exception 'Authentication required';end if;
  perform pg_advisory_xact_lock(hashtextextended('rank:'||u::text,0));
  update rank_comparisons set status=case when expires_at<=clock_timestamp() then 'expired' else 'unavailable' end
    where user_id=u and status='pending' and (expires_at<=clock_timestamp() or not rank_song_playable(song_a_id) or not rank_song_playable(song_b_id));
  select id into current_id from rank_comparisons where user_id=u and status='pending';
  if current_id is not null then return current_id;end if;
  if (select count(*) from songs where rank_song_playable(id))<4 then return null;end if;
  select song_a_id,song_b_id into last_a,last_b from rank_comparisons
    where user_id=u and status='voted' order by voted_at desc,id desc limit 1;
  -- shortcut: enumerate pairs for the modest curated catalog; use indexed sampling before operating a large library.
  with eligible as materialized(select id from songs where rank_song_playable(id))
  select x.id,y.id into a,b from eligible x join eligible y on x.id<y.id
    where (last_a is null or (x.id not in(last_a,last_b) and y.id not in(last_a,last_b)))
      and not exists(select 1 from rank_comparisons c where c.user_id=u and c.status='voted'
        and c.song_a_id=x.id and c.song_b_id=y.id and c.voted_at>clock_timestamp()-interval '10 minutes')
    order by random() limit 1;
  if a is null then return null;end if;
  insert into rank_comparisons(user_id,song_a_id,song_b_id) values(u,a,b) returning id into current_id;
  return current_id;
end $$;
revoke all on function prepare_rank_pair() from public,anon,authenticated;

create function start_rank_pair() returns jsonb language plpgsql security definer set search_path=public as $$
declare pair_id uuid;
begin
  if not reserve_request('rank') then return jsonb_build_object('error','Too many Rank requests. Try again next minute.');end if;
  begin
    lock table daily_matchups,songs,votes,rating_events,rank_comparisons,rank_votes in row exclusive mode;
    pair_id:=prepare_rank_pair();
    return jsonb_build_object('comparisonId',pair_id);
  exception when others then return jsonb_build_object('error','Could not prepare a pair. Please retry.');end;
end $$;
revoke all on function start_rank_pair() from public,anon;
grant execute on function start_rank_pair() to authenticated;

create function get_rank_state() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select to_jsonb(c) into result from rank_comparisons c where user_id=auth.uid() and status='pending'
    and expires_at>now() and rank_song_playable(song_a_id) and rank_song_playable(song_b_id);
  return result;
end $$;
revoke all on function get_rank_state() from public,anon;
grant execute on function get_rank_state() to authenticated;

-- Rating writes keep song IDs; these row locks allow next-pair foreign-key checks without deadlocks.
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
  if (select count(distinct song_id) from song_providers where song_id in(winner.id,loser.id)
    and provider in('youtube','spotify','apple_music') and external_url is not null)<>2 then
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

create function submit_rank_vote(p_comparison_id uuid,p_selected_song_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();c rank_comparisons;v rank_votes;w songs;l songs;k int;expected numeric;delta int;vid uuid;event_time timestamptz;
begin
  if not reserve_request('rank') then return jsonb_build_object('error','Too many Rank requests. Try again next minute.');end if;
  begin
    -- Match recovery's table order before taking comparison/song row locks.
    lock table daily_matchups,songs,votes,rating_events,rank_comparisons,rank_votes in row exclusive mode;
    perform pg_advisory_xact_lock(hashtextextended('rank:'||u::text,0));
    select * into c from rank_comparisons where id=p_comparison_id and user_id=u for update;
    if not found then raise exception 'Comparison unavailable. Request a new pair.';end if;
    if p_selected_song_id is null or p_selected_song_id not in(c.song_a_id,c.song_b_id) then raise exception 'Choose a song from this pair.';end if;
    if c.status='voted' then
      select * into strict v from rank_votes where comparison_id=c.id;
      if v.selected_song_id<>p_selected_song_id then raise exception 'This comparison already has a saved choice.';end if;
      return jsonb_build_object('voteId',v.id,'ratingDelta',v.rating_delta,'replayed',true);
    end if;
    if c.status<>'pending' or c.expires_at<=clock_timestamp() then raise exception 'Comparison expired. Request a new pair.';end if;
    perform id from songs where id in(c.song_a_id,c.song_b_id) order by id for no key update;
    if not rank_song_playable(c.song_a_id) or not rank_song_playable(c.song_b_id) then raise exception 'Playback unavailable. Request a new pair.';end if;
    -- Recheck expiry after waiting for another vote's song locks.
    if c.expires_at<=clock_timestamp() then raise exception 'Comparison expired. Request a new pair.';end if;
    select * into strict w from songs where id=p_selected_song_id;
    select * into strict l from songs where id=case when p_selected_song_id=c.song_a_id then c.song_b_id else c.song_a_id end;
    select elo_k_factor into k from app_settings where id=true;
    expected:=1/(1+power(10,(l.elo_rating-w.elo_rating)/400));delta:=round(k*(1-expected));
    update songs set elo_rating=elo_rating+delta,wins=wins+1,matchup_count=matchup_count+1,updated_at=now() where id=w.id;
    update songs set elo_rating=elo_rating-delta,losses=losses+1,matchup_count=matchup_count+1,updated_at=now() where id=l.id;
    event_time:=clock_timestamp();
    insert into rank_votes(comparison_id,user_id,selected_song_id,rejected_song_id,selected_rating_before,rejected_rating_before,
      selected_rating_after,rejected_rating_after,expected_score,rating_delta,created_at)
    values(c.id,u,w.id,l.id,w.elo_rating,l.elo_rating,w.elo_rating+delta,l.elo_rating-delta,expected,delta,event_time) returning id into vid;
    insert into rating_events(rank_vote_id,winner_song_id,loser_song_id,winner_before,loser_before,winner_after,loser_after,k_factor,created_at)
    values(vid,w.id,l.id,w.elo_rating,l.elo_rating,w.elo_rating+delta,l.elo_rating-delta,k,event_time);
    insert into song_rating_snapshots(song_id,rating,snapshot_date)
      select id,elo_rating,(event_time at time zone 'UTC')::date from songs where id in(w.id,l.id)
      on conflict(song_id,snapshot_date) do update set rating=excluded.rating,created_at=now();
    update rank_comparisons set status='voted',voted_at=event_time where id=c.id;
    perform prepare_rank_pair();
  exception when others then
    return jsonb_build_object('error',case when SQLERRM in('Comparison unavailable. Request a new pair.',
      'Choose a song from this pair.','This comparison already has a saved choice.','Comparison expired. Request a new pair.',
      'Playback unavailable. Request a new pair.') then SQLERRM else 'Could not record your preference. Retry the same choice safely.' end);
  end;
  return jsonb_build_object('voteId',vid,'ratingDelta',delta,'replayed',false);
end $$;
revoke all on function submit_rank_vote(uuid,text) from public,anon;
grant execute on function submit_rank_vote(uuid,text) to authenticated;

create view rating_vote_sources as
  select v.id,'daily'::text as mode,v.user_id,v.song_a_id,v.song_b_id,v.selected_song_id,v.rejected_song_id,
    v.selected_rating_before,v.rejected_rating_before,v.selected_rating_after,v.rejected_rating_after,v.expected_score,v.rating_delta,m.matchup_day as event_day
    from votes v join daily_matchups m on m.id=v.matchup_id
  union all
  select v.id,'rank',v.user_id,c.song_a_id,c.song_b_id,v.selected_song_id,v.rejected_song_id,
    v.selected_rating_before,v.rejected_rating_before,v.selected_rating_after,v.rejected_rating_after,v.expected_score,v.rating_delta,(v.created_at at time zone 'UTC')::date
    from rank_votes v join rank_comparisons c on c.id=v.comparison_id;
revoke all on rating_vote_sources from public,anon,authenticated;

create or replace function process_rankings() returns integer language plpgsql security definer set search_path=public as $$
declare event_record record;n int;
begin
  if not is_admin() then raise exception 'Admin access required';end if;
  lock table daily_matchups,songs,votes,rating_events,rank_comparisons,rank_votes in exclusive mode;
  if exists(select 1 from rating_vote_sources v left join rating_events e
      on (v.mode='daily' and e.vote_id=v.id) or (v.mode='rank' and e.rank_vote_id=v.id) where e.id is null)
    or exists(select 1 from rating_events e left join rating_vote_sources v
      on (v.mode='daily' and e.vote_id=v.id) or (v.mode='rank' and e.rank_vote_id=v.id)
      where v.id is null or e.winner_song_id<>v.selected_song_id or e.loser_song_id<>v.rejected_song_id
      or e.winner_before<>v.selected_rating_before or e.loser_before<>v.rejected_rating_before
      or e.winner_after<>v.selected_rating_after or e.loser_after<>v.rejected_rating_after
      or e.winner_after-e.winner_before<>v.rating_delta or e.loser_before-e.loser_after<>v.rating_delta
      or e.k_factor not between 1 and 100 or v.expected_score<>1/(1+power(10,(e.loser_before-e.winner_before)/400))
      or v.rating_delta<>round(e.k_factor*(1-v.expected_score)))
    or exists(select 1 from votes v join daily_matchups m on m.id=v.matchup_id left join user_daily_activity a on a.vote_id=v.id
      where v.song_a_id<>m.song_a_id or v.song_b_id<>m.song_b_id or a.vote_id is null or a.user_id<>v.user_id or a.activity_day<>m.matchup_day)
    or exists(select 1 from rank_votes v join rank_comparisons c on c.id=v.comparison_id where c.status<>'voted'
      or c.user_id<>v.user_id or c.voted_at<>v.created_at or v.created_at<c.created_at or v.created_at>=c.expires_at
      or v.selected_song_id not in(c.song_a_id,c.song_b_id)
      or v.rejected_song_id not in(c.song_a_id,c.song_b_id))
    or exists(select 1 from rank_comparisons c left join rank_votes v on v.comparison_id=c.id where c.status='voted' and v.id is null) then
    raise exception 'Audit records are inconsistent. No rankings changed';end if;
  create temporary table replay_ratings(song_id text primary key,rating numeric not null,wins int not null default 0,losses int not null default 0) on commit drop;
  insert into replay_ratings(song_id,rating) select id,1500 from songs;
  for event_record in select * from rating_events order by event_order loop
    if (select rating from replay_ratings where song_id=event_record.winner_song_id)<>event_record.winner_before
      or (select rating from replay_ratings where song_id=event_record.loser_song_id)<>event_record.loser_before then
      raise exception 'Audit records are inconsistent. No rankings changed';end if;
    update replay_ratings set rating=event_record.winner_after,wins=wins+1 where song_id=event_record.winner_song_id;
    update replay_ratings set rating=event_record.loser_after,losses=losses+1 where song_id=event_record.loser_song_id;
  end loop;
  update songs s set elo_rating=r.rating,wins=r.wins,losses=r.losses,matchup_count=r.wins+r.losses,updated_at=now()
    from replay_ratings r where s.id=r.song_id;
  update daily_matchups m set song_a_votes=(select count(*) from votes where matchup_id=m.id and selected_song_id=m.song_a_id),
    song_b_votes=(select count(*) from votes where matchup_id=m.id and selected_song_id=m.song_b_id);
  delete from song_rating_snapshots;
  with states as(
    select e.winner_song_id as song_id,v.event_day,e.event_order,e.winner_after as rating from rating_events e join rating_vote_sources v
      on (v.mode='daily' and e.vote_id=v.id) or (v.mode='rank' and e.rank_vote_id=v.id)
    union all
    select e.loser_song_id,v.event_day,e.event_order,e.loser_after from rating_events e join rating_vote_sources v
      on (v.mode='daily' and e.vote_id=v.id) or (v.mode='rank' and e.rank_vote_id=v.id))
  insert into song_rating_snapshots(song_id,snapshot_date,rating)
    select distinct on(song_id,event_day) song_id,event_day,rating from states order by song_id,event_day,event_order desc;
  select count(*) into n from rating_events;
  insert into admin_audit_log(actor_id,entity,entity_id,operation,after_value)
    values(auth.uid(),'rankings','global','REBUILD',jsonb_build_object('events',n));
  drop table replay_ratings;
  return n;
end $$;
notify pgrst,'reload schema';
commit;
