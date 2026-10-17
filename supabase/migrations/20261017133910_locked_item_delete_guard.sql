-- Deleting an item cascades into event_items and would silently remove it from
-- a locked event's item list, bypassing the lock freeze. Refuse the delete for
-- API roles while any locked event still lists the item (the client only
-- archives items, so this is a safety net).
create or replace function public.guard_item_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and exists (
    select 1
      from public.event_items ei
      join public.events ev on ev.id = ei.event_id
     where ei.item_id = old.id
       and ev.locked_at is not null
  ) then
    raise exception 'item is used by a locked event' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke execute on function public.guard_item_delete() from public, anon, authenticated;

drop trigger if exists items_locked_delete_guard on public.items;
create trigger items_locked_delete_guard
  before delete on public.items
  for each row execute function public.guard_item_delete();
