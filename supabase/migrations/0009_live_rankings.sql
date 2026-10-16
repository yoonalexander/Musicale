begin;
-- The public stream contains catalog songs only, never viewer or editorial activity.
do $$ begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime set table public.songs;
commit;
