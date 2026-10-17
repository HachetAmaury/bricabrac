-- NOTE: later migrations supersede parts of this file; read them together.
--   20261017000001_hardening:
--     handle_new_user (is_admin from raw_app_meta_data), is_event_member,
--     can_access_catalog, shares_event_with (now require is_active());
--     adds is_active(), protect_event_ownership trigger, profiles_update_admin;
--     replaces events_insert, catalogs_insert (created_by = auth.uid()).
--   20261017000002_lock_freeze:
--     protect_event_ownership (locked cash freeze); adds guard_event_items.
--   20261017000003_active_checks:
--     replaces sales_delete, profiles_update_own, event_members_select.
--   20261017000004_event_items_no_update:
--     replaces event_items_all with event_items_select/insert/delete.
--
-- Initial schema for the flea-market POS: tables, RLS, helpers, realtime.
-- All ids are client-generated UUIDs (except profiles.id = auth.users.id).
-- Money columns are integer cents.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalogs (
  id uuid primary key,
  name text not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null,
  price integer not null,
  icon text,
  category_id uuid references public.categories(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key,
  catalog_id uuid not null references public.catalogs(id),
  name text not null,
  kind text not null check (kind in ('tournoi','bric-a-brac','autre')),
  locked_at timestamptz,
  cash_float integer,
  cash_count jsonb,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_items (
  event_id uuid references public.events(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  primary key (event_id, item_id)
);

create table public.event_members (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (event_id, user_id)
);

create table public.sales (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  "timestamp" bigint not null,
  lines jsonb not null,
  total integer not null,
  cash_given integer,
  change integer,
  created_at timestamptz not null default now()
);

-- Foreign-key indexes (used by RLS helpers and cascades).
create index categories_catalog_id_idx on public.categories (catalog_id);
create index items_catalog_id_idx on public.items (catalog_id);
create index items_category_id_idx on public.items (category_id);
create index events_catalog_id_idx on public.events (catalog_id);
create index events_created_by_idx on public.events (created_by);
create index catalogs_created_by_idx on public.catalogs (created_by);
create index event_items_item_id_idx on public.event_items (item_id);
create index event_members_user_id_idx on public.event_members (user_id);
create index sales_event_id_idx on public.sales (event_id);
create index sales_seller_id_idx on public.sales (seller_id);

-- ---------------------------------------------------------------- updated_at

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger catalogs_set_updated_at before update on public.catalogs
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- helpers
-- security definer so they are not themselves filtered by RLS.

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and not disabled
  );
$$;

create function public.is_event_member(e uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.event_members
    where event_id = e and user_id = auth.uid()
  );
$$;

create function public.can_access_catalog(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.events ev
    join public.event_members m on m.event_id = ev.id
    where ev.catalog_id = c and m.user_id = auth.uid()
  );
$$;

create function public.shares_event_with(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members a
    join public.event_members b on a.event_id = b.event_id
    where a.user_id = auth.uid() and b.user_id = p
  );
$$;

-- True when a sale stamped at ts (epoch ms) may be written for event e:
-- the event exists and is not locked, or ts is before the lock instant.
create function public.sale_allowed_at(e uuid, ts bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select locked_at is null
            or ts < (extract(epoch from locked_at) * 1000)::bigint
     from public.events where id = e),
    false
  );
$$;

-- ---------------------------------------------------------------- auth hooks

-- Create the profile row when a user signs up / is invited.
create function public.handle_new_user()
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
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admin API users cannot change is_admin / disabled (even on their own
-- row). Roles other than anon/authenticated (postgres, service_role) are
-- trusted back-office paths and are not restricted.
create function public.protect_profile_flags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and not public.is_admin()
     and (new.is_admin is distinct from old.is_admin
          or new.disabled is distinct from old.disabled) then
    raise exception 'only admins can change is_admin or disabled'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_flags
  before update on public.profiles
  for each row execute function public.protect_profile_flags();

-- Make the creator of an event a member so they can see it.
create function public.add_event_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.event_members (event_id, user_id)
    values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger events_add_creator_member
  after insert on public.events
  for each row execute function public.add_event_creator_as_member();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_event_creator_as_member() from public, anon, authenticated;

-- RLS helpers: callable by signed-in users only (policies need EXECUTE).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_event_member(uuid) from public, anon;
revoke execute on function public.can_access_catalog(uuid) from public, anon;
revoke execute on function public.shares_event_with(uuid) from public, anon;
revoke execute on function public.sale_allowed_at(uuid, bigint) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_event_member(uuid) to authenticated;
grant execute on function public.can_access_catalog(uuid) to authenticated;
grant execute on function public.shares_event_with(uuid) to authenticated;
grant execute on function public.sale_allowed_at(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.catalogs enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.events enable row level security;
alter table public.event_items enable row level security;
alter table public.event_members enable row level security;
alter table public.sales enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_event_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- event_members
create policy event_members_select on public.event_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy event_members_insert on public.event_members for insert to authenticated
  with check (public.is_admin());
create policy event_members_delete on public.event_members for delete to authenticated
  using (public.is_admin());

-- events
create policy events_select on public.events for select to authenticated
  using (public.is_event_member(id));
create policy events_insert on public.events for insert to authenticated
  with check (public.can_access_catalog(catalog_id));
create policy events_update on public.events for update to authenticated
  using (public.is_event_member(id))
  with check (public.is_event_member(id));
create policy events_delete on public.events for delete to authenticated
  using (public.is_admin());

-- catalogs
create policy catalogs_select on public.catalogs for select to authenticated
  using (public.can_access_catalog(id));
create policy catalogs_insert on public.catalogs for insert to authenticated
  with check (public.is_admin());
create policy catalogs_update on public.catalogs for update to authenticated
  using (public.can_access_catalog(id))
  with check (public.can_access_catalog(id));
create policy catalogs_delete on public.catalogs for delete to authenticated
  using (public.is_admin());

-- categories
create policy categories_select on public.categories for select to authenticated
  using (public.can_access_catalog(catalog_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (public.can_access_catalog(catalog_id));
create policy categories_update on public.categories for update to authenticated
  using (public.can_access_catalog(catalog_id))
  with check (public.can_access_catalog(catalog_id));
create policy categories_delete on public.categories for delete to authenticated
  using (public.can_access_catalog(catalog_id));

-- items
create policy items_select on public.items for select to authenticated
  using (public.can_access_catalog(catalog_id));
create policy items_insert on public.items for insert to authenticated
  with check (public.can_access_catalog(catalog_id));
create policy items_update on public.items for update to authenticated
  using (public.can_access_catalog(catalog_id))
  with check (public.can_access_catalog(catalog_id));
create policy items_delete on public.items for delete to authenticated
  using (public.can_access_catalog(catalog_id));

-- event_items
create policy event_items_all on public.event_items for all to authenticated
  using (public.is_event_member(event_id))
  with check (public.is_event_member(event_id));

-- sales (no update policy: sales are immutable)
create policy sales_select on public.sales for select to authenticated
  using (public.is_event_member(event_id));
create policy sales_insert on public.sales for insert to authenticated
  with check (
    public.is_event_member(event_id)
    and seller_id = auth.uid()
    and public.sale_allowed_at(event_id, "timestamp")
  );
create policy sales_delete on public.sales for delete to authenticated
  using (
    seller_id = auth.uid()
    and public.sale_allowed_at(event_id, (extract(epoch from now()) * 1000)::bigint)
  );

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table
  public.sales, public.items, public.categories,
  public.events, public.event_items, public.event_members;

alter table public.sales replica identity full;
alter table public.event_items replica identity full;
alter table public.event_members replica identity full;
