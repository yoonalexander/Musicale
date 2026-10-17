begin;

-- Public operational aggregates deliberately omit future choices and private activity.
create or replace function public.get_product_readiness() returns jsonb
language sql stable security definer set search_path=public as $$
  with calendar as (
    select (now() at time zone 'UTC')::date as today
  ), days as (
    select today, n, today+n as day from calendar cross join generate_series(0,30) n
  ), coverage as (
    select d.*, exists(
      select 1 from daily_matchups m
      join songs a on a.id=m.song_a_id join songs b on b.id=m.song_b_id
      where m.matchup_day=d.day and m.status in ('scheduled','active')
        and a.status='active' and b.status='active'
        and rank_song_playable(a.id) and rank_song_playable(b.id)
        and case when d.n=0 then m.starts_at<=now() and m.ends_at>now()
          else m.starts_at<=d.day::timestamp at time zone 'UTC'
            and m.ends_at>=(d.day+1)::timestamp at time zone 'UTC' end
    ) as playable from days d
  ) select jsonb_build_object(
    'utc_day',min(today),
    'today_playable',bool_or(n=0 and playable),
    'buffer_days',coalesce(min(n) filter(where n>0 and not playable),31)-1,
    'scheduled_days',count(*) filter(where n>0 and playable)
  ) from coverage
$$;
revoke all on function public.get_product_readiness() from public;
grant execute on function public.get_product_readiness() to anon,authenticated;
notify pgrst,'reload schema';
commit;
