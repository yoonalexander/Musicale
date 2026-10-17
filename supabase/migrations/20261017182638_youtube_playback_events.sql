-- Extend current audio events and retain legacy clients' outbound-link mapping.
alter table public.product_event_counts drop constraint product_event_counts_event_check;
alter table public.product_event_counts add constraint product_event_counts_event_check
check (event in ('landing_view','sign_in_started','daily_view','preview_play_started','preview_play_failed',
  'vote_submitted','share_copied','leaderboard_view','streak_continued',
  'listening_link_clicked','youtube_player_ready','youtube_play_started','youtube_player_error'));

create or replace function public.record_product_event(p_event text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_event='preview_started' then p_event:='listening_link_clicked';end if;
 if p_event not in ('landing_view','sign_in_started','daily_view','preview_play_started','preview_play_failed',
   'vote_submitted','share_copied','leaderboard_view','streak_continued',
   'listening_link_clicked','youtube_player_ready','youtube_play_started','youtube_player_error')
 then raise exception 'Invalid event'; end if;
 if not reserve_request('analytics') then return; end if;
 delete from product_event_counts where event_day<(now() at time zone 'UTC')::date-90;
 insert into product_event_counts values((now() at time zone 'UTC')::date,p_event,1)
 on conflict(event_day,event) do update set count=product_event_counts.count+1;
end $$;
revoke all on function public.record_product_event(text) from public,anon;
grant execute on function public.record_product_event(text) to authenticated;
