begin;

-- Keep the request budget outside the business-write subtransaction.
alter function update_my_display_name(text) rename to process_display_name;
revoke all on function process_display_name(text) from public,anon,authenticated;
create function update_my_display_name(p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not reserve_request('profile') then
    return jsonb_build_object('error','Too many requests. Try again next minute.');
  end if;
  begin
    perform process_display_name(p_name);
  exception when others then
    return jsonb_build_object('error',case when SQLERRM='Use a name of 1 to 60 characters'
      then SQLERRM else 'Could not save display name.' end);
  end;
  return null;
end $$;
revoke all on function update_my_display_name(text) from public,anon;
grant execute on function update_my_display_name(text) to authenticated;

alter function save_catalog(jsonb) rename to process_catalog;
revoke all on function process_catalog(jsonb) from public,anon,authenticated;
create function save_catalog(p_songs jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare failed_constraint text;
begin
  if not reserve_request('admin') then
    return jsonb_build_object('error','Too many requests. Try again next minute.');
  end if;
  begin
    if p_songs is null then raise exception 'Import 1 to 100 songs at a time';end if;
    perform process_catalog(p_songs);
  exception when others then
    get stacked diagnostics failed_constraint=CONSTRAINT_NAME;
    return jsonb_build_object('error',case
      when SQLSTATE='23514' then 'Invalid catalog metadata: '||failed_constraint
      when SQLSTATE='23505' then 'duplicate key in catalog or provider IDs'
      when SQLERRM='Import 1 to 100 songs at a time' then SQLERRM
      else 'Catalog could not be saved.' end);
  end;
  return null;
end $$;
revoke all on function save_catalog(jsonb) from public,anon;
grant execute on function save_catalog(jsonb) to authenticated;

alter function schedule_matchup_batch(jsonb) rename to process_matchup_batch;
revoke all on function process_matchup_batch(jsonb) from public,anon,authenticated;
create function schedule_matchup_batch(p_matchups jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare inserted int;
begin
  if not reserve_request('admin') then
    return jsonb_build_object('error','Too many requests. Try again next minute.');
  end if;
  begin
    if p_matchups is null then raise exception 'Schedule 1 to 31 matchups';end if;
    inserted:=process_matchup_batch(p_matchups);
  exception when others then
    return jsonb_build_object('error',case when SQLERRM in('Schedule 1 to 31 matchups',
      'Use today or a future day','Choose two active songs with playback providers') then SQLERRM
      else 'Could not schedule matchups. No days changed.' end);
  end;
  return to_jsonb(inserted);
end $$;
revoke all on function schedule_matchup_batch(jsonb) from public,anon;
grant execute on function schedule_matchup_batch(jsonb) to authenticated;

alter function rebuild_rankings() rename to process_rankings;
revoke all on function process_rankings() from public,anon,authenticated;
create or replace function process_rankings() returns integer language plpgsql security definer set search_path=public as $$
declare n int;
begin
 if not is_admin() then raise exception 'Admin access required';end if;
 lock table daily_matchups,songs,votes,rating_events in exclusive mode;
 if exists(select 1 from votes v left join rating_events e on e.vote_id=v.id where e.id is null)
   or exists(select 1 from rating_events e join votes v on v.id=e.vote_id where e.winner_song_id<>v.selected_song_id or e.loser_song_id<>v.rejected_song_id
     or e.winner_after-e.winner_before<>v.rating_delta or e.loser_before-e.loser_after<>v.rating_delta
     or e.winner_before<>v.selected_rating_before or e.loser_before<>v.rejected_rating_before
     or e.winner_after<>v.selected_rating_after or e.loser_after<>v.rejected_rating_after
     or e.k_factor not between 1 and 100
     or v.expected_score<>1/(1+power(10,(e.loser_before-e.winner_before)/400))
     or v.rating_delta<>round(e.k_factor*(1-v.expected_score)))
   or exists(select 1 from votes v join daily_matchups m on m.id=v.matchup_id
     left join user_daily_activity a on a.vote_id=v.id where
     v.song_a_id<>m.song_a_id or v.song_b_id<>m.song_b_id or a.vote_id is null
     or a.user_id<>v.user_id or a.activity_day<>m.matchup_day) then
   raise exception 'Audit records are inconsistent. No rankings changed';end if;
 with changes as(select winner_song_id as song_id,winner_after-winner_before as delta,1 as win,0 as loss from rating_events
   union all select loser_song_id,loser_after-loser_before,0,1 from rating_events),
 totals as(select song_id,sum(delta) as delta,sum(win) as wins,sum(loss) as losses from changes group by song_id)
 update songs s set elo_rating=1500+coalesce(t.delta,0),wins=coalesce(t.wins,0),losses=coalesce(t.losses,0),
   matchup_count=coalesce(t.wins,0)+coalesce(t.losses,0),updated_at=now() from
   (select s.id,t.* from songs s left join totals t on t.song_id=s.id) t where s.id=t.id;
 update daily_matchups m set song_a_votes=(select count(*) from votes v where v.matchup_id=m.id and v.selected_song_id=m.song_a_id),
   song_b_votes=(select count(*) from votes v where v.matchup_id=m.id and v.selected_song_id=m.song_b_id) where m.id is not null;
 delete from song_rating_snapshots where song_id is not null;
 with changes as(select e.winner_song_id as song_id,m.matchup_day as day,e.winner_after-e.winner_before as delta from rating_events e join votes v on v.id=e.vote_id join daily_matchups m on m.id=v.matchup_id
   union all select e.loser_song_id,m.matchup_day,e.loser_after-e.loser_before from rating_events e join votes v on v.id=e.vote_id join daily_matchups m on m.id=v.matchup_id),
 days as(select song_id,day,sum(delta) as delta from changes group by song_id,day)
 insert into song_rating_snapshots(song_id,snapshot_date,rating)
 select song_id,day,1500+sum(delta) over(partition by song_id order by day) from days;
 select count(*) into n from rating_events;
 insert into admin_audit_log(actor_id,entity,entity_id,operation,after_value) values(auth.uid(),'rankings','global','REBUILD',jsonb_build_object('events',n));
 return n;
end $$;

create function rebuild_rankings() returns jsonb
language plpgsql security definer set search_path=public as $$
declare replayed int;
begin
  if not reserve_request('admin') then
    return jsonb_build_object('error','Too many requests. Try again next minute.');
  end if;
  begin
    replayed:=process_rankings();
  exception when others then
    return jsonb_build_object('error',case when SQLERRM='Audit records are inconsistent. No rankings changed'
      then SQLERRM else 'Rebuild failed. No rankings changed.' end);
  end;
  return to_jsonb(replayed);
end $$;
revoke all on function rebuild_rankings() from public,anon;
grant execute on function rebuild_rankings() to authenticated;

-- RPCs reserve once as their definer; direct API edits reserve once per row as authenticated.
create function budget_editorial_write() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if current_user='authenticated' and not reserve_request('admin') then
    raise exception 'Too many requests. Try again next minute.';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function budget_editorial_write() from public,anon,authenticated;
create trigger budget_editorial_write before insert or update or delete on songs
  for each row execute function budget_editorial_write();
create trigger budget_editorial_write before insert or update or delete on song_providers
  for each row execute function budget_editorial_write();
create trigger budget_editorial_write before insert or update or delete on daily_matchups
  for each row execute function budget_editorial_write();
create trigger budget_editorial_write before update on app_settings
  for each row execute function budget_editorial_write();

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
      and exists(select 1 from song_providers p where p.song_id=s.id and p.provider in('youtube','spotify','apple_music') and p.external_url is not null))<>2 then
      raise exception 'Choose two active songs with playback providers';
    end if;
  end if;
  return new;
end $$;

-- Expose the changed RPC return contracts after this transaction commits.
notify pgrst,'reload schema';
commit;
