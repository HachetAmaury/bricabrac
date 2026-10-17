-- Hardening after review of 20261017000000_initial.

-- 1. is_admin comes from app_metadata (writable by the service role only),
--    never from user_metadata (writable by the user via auth.updateUser).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce((new.raw_app_meta_data->>'is_admin')::boolean, false)
  );
  return new;
end;
$$;

-- 2. Members may rename / lock / count cash on an event, but only admins may
--    move it to another catalog or change its creator. Non-API roles
--    (postgres, service_role) are trusted, as for profiles.
create function public.protect_event_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and not public.is_admin()
     and (new.catalog_id is distinct from old.catalog_id
          or new.created_by is distinct from old.created_by) then
    raise exception 'only admins can change catalog_id or created_by'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_protect_ownership
  before update on public.events
  for each row execute function public.protect_event_ownership();

-- 3. A disabled profile loses all access, not only admin rights.
create function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and not disabled
  );
$$;

create or replace function public.is_event_member(e uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.is_active() and exists (
    select 1 from public.event_members
    where event_id = e and user_id = auth.uid()
  ));
$$;

create or replace function public.can_access_catalog(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.is_active() and exists (
    select 1
    from public.events ev
    join public.event_members m on m.event_id = ev.id
    where ev.catalog_id = c and m.user_id = auth.uid()
  ));
$$;

create or replace function public.shares_event_with(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active() and exists (
    select 1
    from public.event_members a
    join public.event_members b on a.event_id = b.event_id
    where a.user_id = auth.uid() and b.user_id = p
  );
$$;

revoke execute on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;
revoke execute on function public.protect_event_ownership() from public, anon, authenticated;

-- 4. Admins may update any profile (rename, disable, promote).
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5. No spoofed creator on insert (the column default fills auth.uid()).
drop policy events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (public.can_access_catalog(catalog_id) and created_by = auth.uid());

drop policy catalogs_insert on public.catalogs;
create policy catalogs_insert on public.catalogs for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());
