begin;
create or replace function update_my_display_name(p_name text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 60 or p_name ~ '[[:cntrl:]]' then raise exception 'Use a name of 1 to 60 characters';end if;
 update profiles set display_name=trim(p_name),updated_at=now() where user_id=auth.uid();
end $$;
commit;
