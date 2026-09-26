-- Dine-in foundation: tables, table sessions, and staff-built dine-in orders
-- go through the same pricing/stock/workflow invariants as every other order.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

create function pg_temp.act_as(uid uuid, role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then json_build_object('role', role)::text
         else json_build_object('sub', uid, 'role', role)::text end, true);
end $$;

\set A '''a0000000-0000-4000-8000-00000000000a'''
\set B '''b0000000-0000-4000-8000-00000000000b'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:A, :B);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
insert into auth.users (id, email) values
  ('55555555-0000-4000-8000-0000000000e1', 'p-dine-owner-a@test.local'),
  ('55555555-0000-4000-8000-0000000000e2', 'p-dine-staff-a@test.local'),
  ('55555555-0000-4000-8000-0000000000e3', 'p-dine-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '55555555-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '55555555-0000-4000-8000-0000000000e2', 'staff'),
  (:B, '55555555-0000-4000-8000-0000000000e3', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active' where id in (:A, :B);
update public.tenant_settings set tax = '{"rate_bps": 1500, "included": true}' where tenant_id = :A;
update public.inventory_items i set on_hand = 10, reserved = 0, allow_backorder = false, track_stock = true
from public.product_variants v where v.id = i.variant_id and v.sku = 'ETH-YIR-250' and v.tenant_id = :A;

-- ---------------------------------------------------------------------------
-- Tables: permission-checked, tenant-scoped
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select public.create_table('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default), 'Table 1', 4) $$,
  '42501', null, 'anon cannot create a table');
select throws_ok($$ select * from public.tables $$, '42501', null, 'anon cannot read tables');
reset role;

select pg_temp.act_as('55555555-0000-4000-8000-0000000000e2');
set local role authenticated;
select lives_ok($$ select public.create_table('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default), 'Table 1', 4) $$,
  'Staff (orders.write) can create a table');
reset role;

select pg_temp.act_as('55555555-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.tables where tenant_id = :A), 0, 'Owner B cannot see Store A''s tables');
reset role;

-- ---------------------------------------------------------------------------
-- Table sessions: one open session per table, staff-only lifecycle
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.open_table_session('a0000000-0000-4000-8000-00000000000a', 'ffffffff-0000-4000-8000-000000000000', 2) $$,
  '22023', 'invalid_table', 'Opening a session at an unknown table is rejected');
select lives_ok($$ select public.open_table_session('a0000000-0000-4000-8000-00000000000a', (select id from public.tables where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and label = 'Table 1'), 2) $$,
  'Owner opens a session for a party of 2');
select is((select status from public.tables where tenant_id = :A and label = 'Table 1'), 'occupied', 'The table is now occupied');
select throws_ok($$ select public.open_table_session('a0000000-0000-4000-8000-00000000000a', (select id from public.tables where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and label = 'Table 1'), 3) $$,
  '22023', 'table_occupied', 'A second session cannot be opened on an already-occupied table');
reset role;

-- ---------------------------------------------------------------------------
-- Dine-in orders: staff builds the order directly; price/tax/stock are computed here
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-0000-4000-8000-0000000000e2');
set local role authenticated;
select throws_ok($$ select public.create_dine_in_order('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open'), '[]'::jsonb) $$,
  '22023', 'empty_order', 'A dine-in order needs at least one item');
select is(public.create_dine_in_order('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open'),
  jsonb_build_array(jsonb_build_object('variant_id', 'f1000000-0000-4000-8000-000000000011', 'qty', 2))) ->> 'total_minor',
  '13000', 'Two bags at 6500 (VAT-included) come to 13000 — computed by the database, not the caller');
select is((select array[on_hand, reserved] from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-250'),
  array[10, 2], 'Stock is reserved for the dine-in order, exactly like an online one');
select is((select status || ':' || fulfillment_type from public.orders where tenant_id = :A and order_number = '1001'), 'pending:dine_in',
  'The order is pending and tagged dine_in');
select is((select contact is null from public.orders where tenant_id = :A and order_number = '1001'), true,
  'No contact is required for a staff-built dine-in order');

select throws_ok($$ select public.create_dine_in_order('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open'),
  jsonb_build_array(jsonb_build_object('variant_id', 'f1000000-0000-4000-8000-000000000011', 'qty', 50))) $$,
  '22023', 'insufficient_stock', 'A second round cannot oversell the remaining stock');
select lives_ok($$ select public.create_dine_in_order('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open'),
  jsonb_build_array(jsonb_build_object('variant_id', 'f1000000-0000-4000-8000-000000000011', 'qty', 1))) $$,
  'A second, smaller round on the same session succeeds');
select is((select count(*)::int from public.orders where table_session_id = (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open')),
  2, 'The session now carries two orders (two rounds)');
reset role;

-- ---------------------------------------------------------------------------
-- Closing a session: only once every order on it is settled
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.close_table_session('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open')) $$,
  '22023', 'open_orders_remaining', 'The session cannot close while its orders are still open');

select is(public.update_order_status((select id from public.orders where tenant_id = :A and order_number = '1001'), 'confirmed'), 'confirmed', 'First round confirmed');
select is(public.update_order_status((select id from public.orders where tenant_id = :A and order_number = '1001'), 'completed'), 'completed', 'First round completed');
select is(public.update_order_status((select id from public.orders where tenant_id = :A and order_number = '1002'), 'cancelled'), 'cancelled', 'Second round cancelled (the table wants to close out)');
select lives_ok($$ select public.close_table_session('a0000000-0000-4000-8000-00000000000a',
  (select id from public.table_sessions where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'open')) $$,
  'Now that every order is settled, the session closes');
select is((select status from public.table_sessions where tenant_id = :A), 'closed', 'The session is closed');
select is((select status from public.tables where tenant_id = :A and label = 'Table 1'), 'available', 'The table is free again');
select lives_ok($$ select public.open_table_session('a0000000-0000-4000-8000-00000000000a', (select id from public.tables where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and label = 'Table 1'), 4) $$,
  'A new party can now be seated at the same table');
reset role;

select * from finish();
rollback;
