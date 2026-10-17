-- Server-side mirror of the client reducer rules for locked events and
-- event_items consistency.

-- 6a. Event ownership + lock freeze. Members (and admins) using the API may
--     rename or unlock a locked event, but cannot change its cash fields
--     while it stays locked. Only admins may change catalog_id / created_by.
--     Non-API roles (postgres, service_role) are trusted.
create or replace function public.protect_event_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if not public.is_admin()
       and (new.catalog_id is distinct from old.catalog_id
            or new.created_by is distinct from old.created_by) then
      raise exception 'only admins can change catalog_id or created_by'
        using errcode = '42501';
    end if;
    if old.locked_at is not null and new.locked_at is not null
       and (new.cash_float is distinct from old.cash_float
            or new.cash_count is distinct from old.cash_count) then
      raise exception 'event is locked: unlock it before changing cash fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 6b + 7. event_items guard.
--   * insert/delete is refused while the event is locked (API roles only, so
--     admin tooling via service_role and FK cascades stay possible);
--   * an inserted item must belong to the event's catalog (all roles).
-- Security invoker on purpose: current_user must be the caller's role (a
-- definer function would see its owner). Lookups run under the caller's RLS,
-- which is sufficient: anyone allowed to write event_items for an event can
-- see that event and the items of its catalog; an item from a catalog the
-- caller cannot see reads as null and is rejected.
create function public.guard_event_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ev_id uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
begin
  if current_user in ('anon', 'authenticated')
     and (select locked_at from public.events where id = ev_id) is not null then
    raise exception 'event is locked: its item list cannot change'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT'
     and (select catalog_id from public.items where id = new.item_id)
         is distinct from
         (select catalog_id from public.events where id = new.event_id) then
    raise exception 'item does not belong to the event''s catalog'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger event_items_guard
  before insert or delete on public.event_items
  for each row execute function public.guard_event_items();

revoke execute on function public.guard_event_items() from public, anon, authenticated;
