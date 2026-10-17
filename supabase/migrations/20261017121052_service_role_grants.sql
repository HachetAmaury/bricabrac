-- Service role (Edge Function `admin-users`, first-admin script) must read and
-- write every table; it bypasses RLS but still needs table privileges, which
-- the earlier migrations never granted. Also drop the leftover TRUNCATE /
-- REFERENCES / TRIGGER privileges that `anon` should never hold.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;

revoke truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- GoTrue writes app_metadata after the auth.users insert, so the insert
-- trigger alone never sees `is_admin`. Keep profiles.is_admin in sync whenever
-- raw_app_meta_data changes as well.
create or replace function public.sync_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set is_admin = coalesce((new.raw_app_meta_data->>'is_admin')::boolean, false)
   where id = new.id
     and is_admin is distinct from coalesce((new.raw_app_meta_data->>'is_admin')::boolean, false);
  return new;
end;
$$;
revoke execute on function public.sync_profile_admin_flag() from public, anon, authenticated;

drop trigger if exists on_auth_user_app_meta_updated on auth.users;
create trigger on_auth_user_app_meta_updated
  after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_admin_flag();
