-- Disabled users lose write access too: sale deletion requires current
-- membership (is_event_member already implies is_active), and own-profile
-- updates / membership reads require an active profile.

drop policy sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
  using (
    public.is_event_member(event_id)
    and seller_id = auth.uid()
    and public.sale_allowed_at(event_id, (extract(epoch from now()) * 1000)::bigint)
  );

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active())
  with check (id = auth.uid() and public.is_active());

drop policy event_members_select on public.event_members;
create policy event_members_select on public.event_members for select to authenticated
  using ((user_id = auth.uid() and public.is_active()) or public.is_admin());
