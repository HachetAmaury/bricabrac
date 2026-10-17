-- The delete guard ran its lookup as the caller, so a locked event the caller
-- cannot see (RLS) did not block the delete. Do the lookup in a SECURITY
-- DEFINER helper and keep the role check in the invoker trigger.
create or replace function public.item_in_locked_event(i uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.event_items ei
      join public.events ev on ev.id = ei.event_id
     where ei.item_id = i
       and ev.locked_at is not null
  );
$$;
-- The invoker trigger below calls this as the signed-in user, so it must stay
-- executable by `authenticated` (anon never deletes items).
revoke execute on function public.item_in_locked_event(uuid) from public, anon;
grant execute on function public.item_in_locked_event(uuid) to authenticated;

create or replace function public.guard_item_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and public.item_in_locked_event(old.id) then
    raise exception 'item is used by a locked event' using errcode = '42501';
  end if;
  return old;
end;
$$;
