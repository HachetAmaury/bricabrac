-- event_items rows are immutable: a "for all" policy allowed UPDATE, which
-- could move a row to another event/item and bypass guard_event_items
-- (insert/delete only). Split into select/insert/delete; with no update
-- policy, UPDATE matches 0 rows for authenticated.

drop policy event_items_all on public.event_items;

create policy event_items_select on public.event_items for select to authenticated
  using (public.is_event_member(event_id));
create policy event_items_insert on public.event_items for insert to authenticated
  with check (public.is_event_member(event_id));
create policy event_items_delete on public.event_items for delete to authenticated
  using (public.is_event_member(event_id));
