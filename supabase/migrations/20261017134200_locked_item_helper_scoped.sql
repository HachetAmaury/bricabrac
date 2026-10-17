-- Scope the definer helper to catalogs the caller can access, so it cannot be
-- used over RPC as an oracle for guessed item ids.
create or replace function public.item_in_locked_event(i uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_access_catalog((select catalog_id from public.items where id = i))
     and exists (
    select 1
      from public.event_items ei
      join public.events ev on ev.id = ei.event_id
     where ei.item_id = i
       and ev.locked_at is not null
  );
$$;
