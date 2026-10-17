begin;

alter table request_budgets drop constraint request_budgets_action_check;
alter table request_budgets add constraint request_budgets_action_check
  check(action in('vote','admin','profile','analytics','rank','play'));
create or replace function reserve_request(p_action text) returns boolean language plpgsql security definer set search_path=public as $$
declare n int;budget int;u uuid:=auth.uid();
begin
  if u is null then raise exception 'Authentication required';end if;
  budget:=case p_action when 'vote' then 10 when 'admin' then 30 when 'profile' then 5 when 'analytics' then 30 when 'rank' then 30 when 'play' then 30 end;
  if budget is null then raise exception 'Invalid request category';end if;
  if p_action='admin' and not is_admin() then raise exception 'Admin access required';end if;
  delete from request_budgets where window_start<now()-interval '7 days';
  insert into request_budgets values(u,p_action,date_trunc('minute',now()),1)
  on conflict(user_id,action,window_start) do update set attempts=least(request_budgets.attempts+1,10000) returning attempts into n;
  return n<=budget;
end $$;

create table play_runs(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0 check(score>=0),
  status text not null default 'active' check(status in('active','paused','ended')),
  reason text check(reason in('insufficient','expired','unavailable','wrong','restarted')),
  created_at timestamptz not null default clock_timestamp(),
  check((status='active')=(reason is null))
);
create unique index play_one_open_run on play_runs(user_id) where status<>'ended';
create index play_runs_owner on play_runs(user_id,created_at desc,id desc);
create table play_rounds(
  id uuid primary key default gen_random_uuid(),run_id uuid not null references play_runs(id) on delete cascade,
  number integer not null check(number>0),unique(run_id,number),
  song_a_id text not null references songs(id),song_b_id text not null references songs(id),check(song_a_id<>song_b_id),
  rating_a numeric not null,rating_b numeric not null,check(rating_a<>rating_b),
  created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
  status text not null default 'pending' check(status in('pending','answered','expired','unavailable')),
  selected_song_id text references songs(id),correct boolean,score_after integer check(score_after>=0),
  answered_at timestamptz,replacement_slot smallint check(replacement_slot in(1,2)),
  check(expires_at>created_at),
  check((status='answered')=(selected_song_id is not null and correct is not null and score_after is not null and answered_at is not null)),
  check(selected_song_id is null or selected_song_id in(song_a_id,song_b_id)),
  check(correct is null or correct=(selected_song_id=case when rating_a>rating_b then song_a_id else song_b_id end)),
  check((replacement_slot is not null)=coalesce(correct,false))
);
create unique index play_one_pending_round on play_rounds(run_id) where status='pending';
alter table play_runs enable row level security;
alter table play_rounds enable row level security;
-- Even owners must use safe projections; a table read would reveal outstanding answers.
revoke all on play_runs,play_rounds from public,anon,authenticated;

create function play_song_eligible(p_id text) returns boolean language sql stable set search_path=public as $$
  select rank_song_playable(p_id) and (
    exists(select 1 from votes where selected_song_id=p_id or rejected_song_id=p_id)
    or exists(select 1 from rank_votes where selected_song_id=p_id or rejected_song_id=p_id))
$$;
revoke all on function play_song_eligible(text) from public,anon,authenticated;

create function prepare_play_round(p_run_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare run_row play_runs;prior play_rounds;a text;b text;ra numeric;rb numeric;round_id uuid;retained text;
begin
  select * into run_row from play_runs where id=p_run_id and user_id=auth.uid() for update;
  if not found or run_row.status='ended' then raise exception 'Run unavailable.';end if;
  select * into prior from play_rounds where run_id=run_row.id order by number desc limit 1 for update;
  if prior.status='pending' then
    if prior.expires_at>clock_timestamp() and play_song_eligible(prior.song_a_id) and play_song_eligible(prior.song_b_id) then return prior.id;end if;
    update play_rounds set status=case when expires_at<=clock_timestamp() then 'expired' else 'unavailable' end where id=prior.id;
    prior.status:='expired';
  end if;
  -- Each selection captures both ratings in one statement snapshot; concurrent votes may change live ratings afterwards.
  if prior.status in('expired','unavailable') then
    select x.id,y.id,x.elo_rating,y.elo_rating into a,b,ra,rb from songs x join songs y on y.id=prior.song_b_id
      where x.id=prior.song_a_id and play_song_eligible(x.id) and play_song_eligible(y.id) and x.elo_rating<>y.elo_rating;
  elsif prior.status='answered' and prior.correct then
    retained:=case prior.replacement_slot when 1 then prior.song_b_id else prior.song_a_id end;
    select case prior.replacement_slot when 1 then candidate.id else kept.id end,
      case prior.replacement_slot when 1 then kept.id else candidate.id end,
      case prior.replacement_slot when 1 then candidate.elo_rating else kept.elo_rating end,
      case prior.replacement_slot when 1 then kept.elo_rating else candidate.elo_rating end into a,b,ra,rb
      from songs kept join songs candidate on candidate.id not in(prior.song_a_id,prior.song_b_id)
      where kept.id=retained and play_song_eligible(kept.id) and play_song_eligible(candidate.id) and kept.elo_rating<>candidate.elo_rating
      order by random() limit 1;
  else
    -- shortcut: enumerate initial pairs for this modest catalog; use indexed sampling before a large library.
    with eligible as materialized(select id,elo_rating from songs where play_song_eligible(id))
    select x.id,y.id,x.elo_rating,y.elo_rating into a,b,ra,rb from eligible x join eligible y on x.id<y.id
      where x.elo_rating<>y.elo_rating order by random() limit 1;
  end if;
  if a is null then
    update play_runs set status='paused',reason='insufficient' where id=run_row.id;return null;
  end if;
  insert into play_rounds(run_id,number,song_a_id,song_b_id,rating_a,rating_b)
    values(run_row.id,coalesce(prior.number,0)+1,a,b,ra,rb) returning id into round_id;
  update play_runs set status='active',reason=null where id=run_row.id;
  return round_id;
end $$;
revoke all on function prepare_play_round(uuid) from public,anon,authenticated;

create function start_play(p_restart_run_id uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare run_row play_runs;pending play_rounds;new_id uuid;
begin
  if not reserve_request('play') then return jsonb_build_object('error','Too many Play requests. Try again next minute.');end if;
  begin
    -- Foreign-key checks need ROW SHARE; take it before private run locks to match recovery's song-first order.
    lock table songs in row share mode;
    perform pg_advisory_xact_lock(hashtextextended('play:'||auth.uid()::text,0));
    select * into run_row from play_runs where user_id=auth.uid() order by created_at desc,id desc limit 1 for update;
    if p_restart_run_id is not null then
      if not exists(select 1 from play_runs where id=p_restart_run_id and user_id=auth.uid()) then raise exception 'Run unavailable.';end if;
      if run_row.id<>p_restart_run_id then return jsonb_build_object('runId',run_row.id,'replayed',true);end if;
      select * into pending from play_rounds where run_id=run_row.id and status='pending';
      if run_row.status='active' and pending.expires_at>clock_timestamp() and play_song_eligible(pending.song_a_id) and play_song_eligible(pending.song_b_id) then
        raise exception 'Finish the current round before starting over.';end if;
      update play_rounds set status='expired' where run_id=run_row.id and status='pending';
      update play_runs set status='ended',reason='restarted' where id=run_row.id and status<>'ended';
      run_row.status:='ended';
    end if;
    if run_row.id is null or run_row.status='ended' then
      insert into play_runs(user_id) values(auth.uid()) returning id into new_id;
    else new_id:=run_row.id;end if;
    perform prepare_play_round(new_id);
  exception when others then return jsonb_build_object('error',case when SQLERRM in('Run unavailable.','Finish the current round before starting over.') then SQLERRM else 'Could not prepare your run. Please retry.' end);end;
  return jsonb_build_object('runId',new_id);
end $$;
revoke all on function start_play(uuid) from public,anon;
grant execute on function start_play(uuid) to authenticated;

create function submit_play_guess(p_round_id uuid,p_selected_song_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare round_row play_rounds;run_row play_runs;is_correct boolean;accepted_at timestamptz;new_score int;
begin
  if not reserve_request('play') then return jsonb_build_object('error','Too many Play requests. Try again next minute.');end if;
  begin
    lock table songs in row share mode;
    perform pg_advisory_xact_lock(hashtextextended('play:'||auth.uid()::text,0));
    select c.* into round_row from play_rounds c join play_runs r on r.id=c.run_id where c.id=p_round_id and r.user_id=auth.uid() for update of c,r;
    if not found then raise exception 'Round unavailable.';end if;
    if p_selected_song_id is null or p_selected_song_id not in(round_row.song_a_id,round_row.song_b_id) then raise exception 'Choose a song from this round.';end if;
    if round_row.status='answered' then
      if round_row.selected_song_id<>p_selected_song_id then raise exception 'This round already has a saved answer.';end if;
      return jsonb_build_object('roundId',round_row.id,'correct',round_row.correct,'scoreAfter',round_row.score_after,'replayed',true);
    end if;
    select * into run_row from play_runs where id=round_row.run_id;
    accepted_at:=clock_timestamp();
    if run_row.status<>'active' or round_row.status<>'pending' or round_row.expires_at<=accepted_at then raise exception 'Round expired. Your points are preserved; resume your run.';end if;
    if not play_song_eligible(round_row.song_a_id) or not play_song_eligible(round_row.song_b_id) then raise exception 'Listening unavailable. Your points are preserved.';end if;
    is_correct:=p_selected_song_id=case when round_row.rating_a>round_row.rating_b then round_row.song_a_id else round_row.song_b_id end;
    new_score:=run_row.score+is_correct::int;
    update play_rounds set status='answered',selected_song_id=p_selected_song_id,correct=is_correct,score_after=new_score,answered_at=accepted_at,
      replacement_slot=case when is_correct then case when random()<0.5 then 1 else 2 end end where id=round_row.id;
    update play_runs set score=new_score,status=case when is_correct then 'active' else 'ended' end,
      reason=case when is_correct then null else 'wrong' end where id=run_row.id;
    if is_correct then perform prepare_play_round(run_row.id);end if;
  exception when others then return jsonb_build_object('error',case when SQLERRM in('Round unavailable.','Choose a song from this round.',
    'This round already has a saved answer.','Round expired. Your points are preserved; resume your run.','Listening unavailable. Your points are preserved.')
    then SQLERRM else 'Could not confirm your guess. Retry the same choice safely.' end);end;
  return jsonb_build_object('roundId',round_row.id,'correct',is_correct,'scoreAfter',new_score,'replayed',false);
end $$;
revoke all on function submit_play_guess(uuid,text) from public,anon;
grant execute on function submit_play_guess(uuid,text) to authenticated;

create function get_play_state(p_answered_round_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare run_row play_runs;pending play_rounds;answer_row play_rounds;effective_status text;effective_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select * into run_row from play_runs where user_id=auth.uid() order by created_at desc,id desc limit 1;
  if not found then return null;end if;
  effective_status:=run_row.status;effective_reason:=run_row.reason;
  select * into pending from play_rounds where run_id=run_row.id and status='pending';
  if pending.id is not null then
    if pending.expires_at<=now() then effective_status:='paused';effective_reason:='expired';pending.id:=null;
    elsif not play_song_eligible(pending.song_a_id) or not play_song_eligible(pending.song_b_id) then effective_status:='paused';effective_reason:='unavailable';pending.id:=null;end if;
  end if;
  select c.* into answer_row from play_rounds c join play_runs r on r.id=c.run_id where r.user_id=auth.uid() and c.status='answered'
    and (case when p_answered_round_id is null then c.run_id=run_row.id else c.id=p_answered_round_id end)
    order by c.number desc limit 1;
  return jsonb_build_object('run',jsonb_build_object('id',run_row.id,'score',run_row.score,'status',effective_status,'reason',effective_reason),
    'round',case when pending.id is not null then jsonb_build_object('id',pending.id,'number',pending.number,'songAId',pending.song_a_id,'songBId',pending.song_b_id,'expiresAt',pending.expires_at) end,
    'answer',case when answer_row.id is not null then jsonb_build_object('id',answer_row.id,'runId',answer_row.run_id,
      'songAId',answer_row.song_a_id,'songBId',answer_row.song_b_id,'titleA',(select title from songs where id=answer_row.song_a_id),
      'titleB',(select title from songs where id=answer_row.song_b_id),'ratingA',answer_row.rating_a,'ratingB',answer_row.rating_b,
      'selectedSongId',answer_row.selected_song_id,'correct',answer_row.correct,'scoreAfter',answer_row.score_after,'replacementSlot',answer_row.replacement_slot) end);
end $$;
revoke all on function get_play_state(uuid) from public,anon;
grant execute on function get_play_state(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
