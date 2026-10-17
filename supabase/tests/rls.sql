-- RLS regression test. Run as postgres (Supabase SQL editor, MCP execute_sql,
-- or: psql "$SUPABASE_DB_URL" -f supabase/tests/rls.sql).
-- Everything happens in one transaction that is rolled back; every assert
-- raises an exception on failure, so reaching the final SELECT = all passed.
--
-- Fixed ids:
--   u_admin  00000000-0000-4000-a000-000000000001
--   u_member 00000000-0000-4000-a000-000000000002
--   u_other  00000000-0000-4000-a000-000000000003
--   catalogs 00000000-0000-4000-a000-0000000000c1, c2 (c3 created by admin)
--   events   00000000-0000-4000-a000-0000000000e1 (e2 created by member)
--   sales    00000000-0000-4000-a000-0000000000a1..a5

begin;

-- ------------------------------------------------------------ fixtures (postgres)
-- u_admin gets is_admin via app_metadata; u_other tries to self-promote via
-- user_metadata, which must be ignored.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-admin@test.invalid', '{"display_name":"Admin"}', '{"is_admin":true}', now(), now()),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-member@test.invalid', '{"display_name":"Member"}', '{}', now(), now()),
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-other@test.invalid', '{"display_name":"Other","is_admin":true}', '{}', now(), now());

do $$
begin
  if (select count(*) from public.profiles
      where id in ('00000000-0000-4000-a000-000000000001',
                   '00000000-0000-4000-a000-000000000002',
                   '00000000-0000-4000-a000-000000000003')) <> 3
     or not (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000001')
     or (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000002')
     or (select is_admin from public.profiles where id = '00000000-0000-4000-a000-000000000003') then
    raise exception 'FAIL 0: handle_new_user did not create the expected profiles';
  end if;
  raise notice 'ok 0 (profiles created by trigger, is_admin only from app_metadata)';
end $$;

insert into public.catalogs (id, name, created_by)
values ('00000000-0000-4000-a000-0000000000c1', 'RLS catalog', '00000000-0000-4000-a000-000000000001'),
       ('00000000-0000-4000-a000-0000000000c2', 'RLS catalog 2', '00000000-0000-4000-a000-000000000001');
insert into public.events (id, catalog_id, name, kind, created_by)
values ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-a000-0000000000c1', 'RLS event', 'autre',
        '00000000-0000-4000-a000-000000000001');
insert into public.event_members (event_id, user_id)
values ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-a000-000000000002');

-- ------------------------------------------------------------ as authenticated
set local role authenticated;

-- u_admin records a sale (used by case 4).
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
insert into public.sales (id, event_id, seller_id, "timestamp", lines, total)
values ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000e1',
        '00000000-0000-4000-a000-000000000001', (extract(epoch from now()) * 1000)::bigint, '[]', 100);

-- Case 1: u_other sees no events.
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL 1: u_other sees % events', n; end if;
  select count(*) into n from public.sales;
  if n <> 0 then raise exception 'FAIL 1: u_other sees % sales', n; end if;
  raise notice 'ok 1 (u_other sees 0 events, 0 sales)';
end $$;

-- From here on: u_member.
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';

-- Case 2: own seller_id ok, someone else's seller_id rejected.
do $$
begin
  if (select count(*) from public.events) <> 1 then
    raise exception 'FAIL 2: u_member should see exactly its event';
  end if;
  insert into public.sales (id, event_id, seller_id, "timestamp", lines, total)
  values ('00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-0000000000e1',
          '00000000-0000-4000-a000-000000000002', (extract(epoch from now()) * 1000)::bigint, '[]', 200);
  begin
    insert into public.sales (id, event_id, seller_id, "timestamp", lines, total)
    values ('00000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-a000-0000000000e1',
            '00000000-0000-4000-a000-000000000001', (extract(epoch from now()) * 1000)::bigint, '[]', 300);
    raise exception 'FAIL 2: sale with seller_id = u_admin was accepted';
  exception when insufficient_privilege then
    null; -- expected: RLS with check violation
  end;
  raise notice 'ok 2 (own sale accepted, forged seller_id rejected)';
end $$;

-- Case 4 (run before locking so only seller_id decides): cannot delete u_admin's sale.
do $$
declare n int;
begin
  delete from public.sales where id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 4: u_member deleted % of u_admin''s sales', n; end if;
  raise notice 'ok 4 (deleting u_admin''s sale affects 0 rows)';
end $$;

-- Case 3: after lock, back-dated sale ok, future-dated sale rejected.
do $$
declare n int;
begin
  update public.events set locked_at = now() where id = '00000000-0000-4000-a000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 3: member could not lock the event'; end if;
  insert into public.sales (id, event_id, seller_id, "timestamp", lines, total)
  values ('00000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-a000-0000000000e1',
          '00000000-0000-4000-a000-000000000002', (extract(epoch from now()) * 1000)::bigint - 60000, '[]', 400);
  begin
    insert into public.sales (id, event_id, seller_id, "timestamp", lines, total)
    values ('00000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-a000-0000000000e1',
            '00000000-0000-4000-a000-000000000002', (extract(epoch from now()) * 1000)::bigint + 60000, '[]', 500);
    raise exception 'FAIL 3: sale stamped after the lock was accepted';
  exception when insufficient_privilege then
    null; -- expected
  end;
  raise notice 'ok 3 (pre-lock sale accepted, post-lock sale rejected)';
end $$;

-- Case 5: u_member cannot promote itself.
do $$
begin
  begin
    update public.profiles set is_admin = true where id = '00000000-0000-4000-a000-000000000002';
    raise exception 'FAIL 5: u_member set its own is_admin';
  exception when insufficient_privilege then
    null; -- expected: protect_profile_flags trigger
  end;
  -- Non-flag columns on the own row stay editable.
  update public.profiles set display_name = 'Member 2' where id = '00000000-0000-4000-a000-000000000002';
  if not found then raise exception 'FAIL 5: u_member cannot edit own display_name'; end if;
  raise notice 'ok 5 (is_admin change rejected, display_name editable)';
end $$;

-- Case 6: member may rename the event but not move it or change its creator.
do $$
declare n int;
begin
  begin
    update public.events set catalog_id = '00000000-0000-4000-a000-0000000000c2'
    where id = '00000000-0000-4000-a000-0000000000e1';
    raise exception 'FAIL 6: member moved the event to another catalog';
  exception when insufficient_privilege then
    null; -- expected: protect_event_ownership trigger
  end;
  begin
    update public.events set created_by = '00000000-0000-4000-a000-000000000002'
    where id = '00000000-0000-4000-a000-0000000000e1';
    raise exception 'FAIL 6: member changed the event creator';
  exception when insufficient_privilege then
    null;
  end;
  update public.events set name = 'RLS event renamed' where id = '00000000-0000-4000-a000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 6: member could not rename the event'; end if;
  raise notice 'ok 6 (catalog_id/created_by change rejected, rename accepted)';
end $$;

-- Case 7: member creates an event; a spoofed created_by is rejected.
do $$
declare n int;
begin
  begin
    insert into public.events (id, catalog_id, name, kind, created_by)
    values ('00000000-0000-4000-a000-0000000000e3', '00000000-0000-4000-a000-0000000000c1', 'spoof', 'autre',
            '00000000-0000-4000-a000-000000000001');
    raise exception 'FAIL 7: event inserted with a foreign created_by';
  exception when insufficient_privilege then
    null;
  end;
  insert into public.events (id, catalog_id, name, kind)
  values ('00000000-0000-4000-a000-0000000000e2', '00000000-0000-4000-a000-0000000000c1', 'Member event', 'tournoi');
  select count(*) into n from public.events;
  if n <> 2 then raise exception 'FAIL 7: creator should see 2 events, sees %', n; end if;
  raise notice 'ok 7 (spoofed event creator rejected, own event created and visible)';
end $$;

-- From here on: u_admin.
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';

-- Case 7b: admin catalog insert with a foreign created_by is rejected.
do $$
begin
  begin
    insert into public.catalogs (id, name, created_by)
    values ('00000000-0000-4000-a000-0000000000c4', 'spoof', '00000000-0000-4000-a000-000000000002');
    raise exception 'FAIL 7b: catalog inserted with a foreign created_by';
  exception when insufficient_privilege then
    null;
  end;
  insert into public.catalogs (id, name) values ('00000000-0000-4000-a000-0000000000c3', 'Admin catalog');
  raise notice 'ok 7b (spoofed catalog creator rejected, default creator accepted)';
end $$;

-- Case 8: admin can rename and disable another user through the API.
do $$
declare n int;
begin
  update public.profiles set display_name = 'Member (renamed by admin)', disabled = true
  where id = '00000000-0000-4000-a000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 8: admin could not update another profile'; end if;
  raise notice 'ok 8 (admin renamed and disabled u_member)';
end $$;

-- Case 9: the disabled member loses all access.
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL 9: disabled member sees % events', n; end if;
  select count(*) into n from public.sales;
  if n <> 0 then raise exception 'FAIL 9: disabled member sees % sales', n; end if;
  select count(*) into n from public.catalogs;
  if n <> 0 then raise exception 'FAIL 9: disabled member sees % catalogs', n; end if;
  select count(*) into n from public.profiles where id <> auth.uid();
  if n <> 0 then raise exception 'FAIL 9: disabled member sees % other profiles', n; end if;
  raise notice 'ok 9 (disabled member sees 0 events, sales, catalogs, other profiles)';
end $$;

reset role;
select 'RLS: all cases passed' as result;

rollback;
