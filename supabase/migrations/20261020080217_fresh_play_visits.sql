-- A new Play visit always creates a fresh run. Repeating the same visit token
-- is idempotent, so action retries cannot repeatedly replace a new game.
create function public.start_fresh_play(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare owner_id uuid;round_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if p_run_id is null then return jsonb_build_object('error','Invalid run. Reload Play.');end if;
  if not reserve_request('play') then return jsonb_build_object('error','Too many Play requests. Try again next minute.');end if;
  begin
    lock table songs in row share mode;
    perform pg_advisory_xact_lock(hashtextextended('play:'||auth.uid()::text,0));
    select user_id into owner_id from play_runs where id=p_run_id;
    if found then
      if owner_id<>auth.uid() then raise exception 'Run unavailable.';end if;
      return jsonb_build_object('runId',p_run_id,'replayed',true);
    end if;
    update play_rounds set status='expired' where status='pending'
      and run_id in(select id from play_runs where user_id=auth.uid() and status<>'ended');
    update play_runs set status='ended',reason='restarted' where user_id=auth.uid() and status<>'ended';
    insert into play_runs(id,user_id) values(p_run_id,auth.uid());
    round_id:=prepare_play_round(p_run_id);
    if round_id is null then
      update play_runs set status='ended',reason='insufficient' where id=p_run_id;
    end if;
  exception when others then
    return jsonb_build_object('error',case when SQLERRM='Run unavailable.' then SQLERRM else 'Could not start your run. Please try again.' end);
  end;
  return jsonb_build_object('runId',p_run_id);
end $$;
revoke all on function public.start_fresh_play(uuid) from public,anon;
grant execute on function public.start_fresh_play(uuid) to authenticated;
