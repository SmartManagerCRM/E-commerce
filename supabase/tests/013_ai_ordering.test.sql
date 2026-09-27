-- AI Operating System Phase 2: guest dine-in checkout (the path the AI
-- ordering assistant uses) and the two guest-safe table functions it needs.
--
-- The single most important assertion in this file is the "critical table
-- test" the spec itself demands (§57/§82): it MUST be impossible to create a
-- dine-in order without an open, tenant-owned table session — both through
-- the guest checkout function the AI calls, AND at the raw table level, so
-- no future code path can ever bypass it either.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

create function pg_temp.act_as(uid uuid, role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then json_build_object('role', role)::text
         else json_build_object('sub', uid, 'role', role)::text end, true);
end $$;

\set A '''a0000000-0000-4000-8000-00000000000a'''
\set B '''b0000000-0000-4000-8000-00000000000b'''
\set T1 '''4444444444444444444444444444444444444444444444444444444444444444'''

update public.tenants set status = 'active' where id in (:A, :B);
update public.tenant_settings set
  checkout = '{"accepting_orders": true, "pickup": true, "delivery": true, "pay_on_fulfillment": true}'
where tenant_id in (:A, :B);
update public.inventory_items i set on_hand = 20, reserved = 0, allow_backorder = false, track_stock = true
from public.product_variants v
where v.id = i.variant_id and v.sku = 'ETH-YIR-250' and v.tenant_id = :A;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
insert into public.tables (id, tenant_id, branch_id, label, capacity) values
  ('55555555-0000-4000-8000-000000000001', :A, (select id from public.branches where tenant_id = :A and is_default), 'Table 12', 4);

-- ---------------------------------------------------------------------------
-- Guest table lookup: safe, tenant-scoped, no session required
-- ---------------------------------------------------------------------------
select is(public.storefront_find_table(:A, 'table 12') ->> 'label', 'Table 12', 'A table is found by its label, case-insensitively');
select is(public.storefront_find_table(:A, 'Table 99'), null, 'An unknown label finds nothing');
select is(public.storefront_find_table(:B, 'Table 12'), null, 'The same label under another tenant finds nothing (tenant-scoped)');

-- ---------------------------------------------------------------------------
-- Opening a session as a guest (no staff session at all)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.storefront_open_table_session('a0000000-0000-4000-8000-00000000000a', gen_random_uuid()) $$,
  '22023', 'invalid_table', 'A made-up table id is rejected');
select throws_ok($$ select public.storefront_open_table_session('b0000000-0000-4000-8000-00000000000b', '55555555-0000-4000-8000-000000000001') $$,
  '22023', 'invalid_table', 'Store B cannot open a session against Store A''s table');

select lives_ok($$ select public.storefront_open_table_session('a0000000-0000-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001') $$,
  'A guest opens a session for Table 12');
select is((select status from public.tables where id = '55555555-0000-4000-8000-000000000001'), 'occupied', 'The table is now occupied');
select is(
  public.storefront_open_table_session(:A, '55555555-0000-4000-8000-000000000001'),
  public.storefront_open_table_session(:A, '55555555-0000-4000-8000-000000000001'),
  'A second guest at the same table joins the same open session rather than creating a new one');

-- ---------------------------------------------------------------------------
-- THE CRITICAL TABLE TEST: dine-in must never reach payment without a table.
-- ---------------------------------------------------------------------------
select public.cart_update(:A, :T1, (select id from public.product_variants where tenant_id = :A and sku = 'ETH-YIR-250'), 2, 'add');

select throws_ok($$ select public.create_order_from_cart('a0000000-0000-4000-8000-00000000000a',
  '4444444444444444444444444444444444444444444444444444444444444444',
  '{"fulfillment":"dine_in","locale":"en","access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  '22023', 'table_required', 'A dine-in checkout with NO table session is refused outright — payment can never be reached from here');

select throws_ok($$ select public.create_order_from_cart('a0000000-0000-4000-8000-00000000000a',
  '4444444444444444444444444444444444444444444444444444444444444444',
  '{"fulfillment":"dine_in","table_session_id":"00000000-0000-4000-8000-000000000000","locale":"en","access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  '22023', 'table_required', 'A dine-in checkout with a table session id that doesn''t exist is refused the same way');

-- Also true at the raw table level, independent of this function entirely —
-- belt and suspenders: no future code path can insert around the gate.
select throws_ok($$ insert into public.orders (tenant_id, branch_id, order_number, fulfillment_type, subtotal_minor,
    total_minor, currency, contact, access_token_hash) values
  ('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default),
   'DIRECT-1', 'dine_in', 0, 0, 'SAR', null, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') $$,
  '23514', null, 'The orders_check constraint itself refuses dine_in with no table_session_id, with or without this function');

-- ---------------------------------------------------------------------------
-- The happy path, once a table is actually captured
-- ---------------------------------------------------------------------------
select is(
  (public.create_order_from_cart(:A, :T1, jsonb_build_object(
    'fulfillment', 'dine_in',
    'table_session_id', public.storefront_open_table_session(:A, '55555555-0000-4000-8000-000000000001'),
    'locale', 'en', 'access_token_hash', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')) ->> 'status'),
  'pending', 'With a captured table session, the dine-in order is created');
select is((select fulfillment_type from public.orders where tenant_id = :A and order_number = '1001'), 'dine_in', 'The order records dine_in');
select is((select table_session_id from public.orders where tenant_id = :A and order_number = '1001'),
  (select id from public.table_sessions where tenant_id = :A and table_id = '55555555-0000-4000-8000-000000000001'),
  'The order is linked to the actual table session');
select is((select contact from public.orders where tenant_id = :A and order_number = '1001'), null,
  'No contact was given, and dine-in does not require one');
select is((select customer_id from public.orders where tenant_id = :A and order_number = '1001'), null,
  'No customer record is created without a contact email');

reset role;

select * from finish();
rollback;
