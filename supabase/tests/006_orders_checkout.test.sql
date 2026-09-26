-- Phase 5: carts, checkout pricing, orders, stock reservation and staff workflows.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

create function pg_temp.act_as(uid uuid, role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then json_build_object('role', role)::text
         else json_build_object('sub', uid, 'role', role)::text end, true);
end $$;

\set A '''a0000000-0000-4000-8000-00000000000a'''
\set B '''b0000000-0000-4000-8000-00000000000b'''
\set T1 '''1111111111111111111111111111111111111111111111111111111111111111'''
\set T2 '''2222222222222222222222222222222222222222222222222222222222222222'''
\set T3 '''3333333333333333333333333333333333333333333333333333333333333333'''
\set K1 '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''

-- Fixtures: members, and known catalog state (seeded catalog from seed.sql).
alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:A, :B);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000e1', 'p5-owner-a@test.local'),
  ('11111111-0000-4000-8000-0000000000e2', 'p5-staff-a@test.local'),
  ('22222222-0000-4000-8000-0000000000e1', 'p5-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '11111111-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '11111111-0000-4000-8000-0000000000e2', 'staff'),
  (:B, '22222222-0000-4000-8000-0000000000e1', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active' where id in (:A, :B);
update public.tenant_settings set
  checkout = '{"accepting_orders": true, "pickup": true, "delivery": true, "pay_on_fulfillment": true}',
  tax = '{"rate_bps": 1500, "included": true}'
where tenant_id = :A;
update public.tenant_settings set checkout = '{"accepting_orders": false}' where tenant_id = :B;
update public.inventory_items i set on_hand = s.qty, reserved = 0, allow_backorder = false, track_stock = true
from (values ('ETH-YIR-250', 10), ('ETH-YIR-1KG', 2), ('COL-HUI-250', 0)) s(sku, qty), public.product_variants v
where v.id = i.variant_id and v.sku = s.sku and v.tenant_id = :A;

-- ---------------------------------------------------------------------------
-- Nobody but the server (service role) can use cart/checkout functions
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select public.cart_view('a0000000-0000-4000-8000-00000000000a', '1111111111111111111111111111111111111111111111111111111111111111') $$,
  '42501', null, 'anon cannot call cart functions directly');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders');
select throws_ok($$ select * from public.customers $$, '42501', null, 'anon cannot read customers');
reset role;

select pg_temp.act_as('11111111-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.create_order_from_cart('a0000000-0000-4000-8000-00000000000a', 'x', '{}') $$,
  '42501', null, 'Signed-in staff cannot place orders through the checkout function');
select throws_ok($$ select * from public.carts $$, '42501', null, 'Carts are not readable by staff clients');
reset role;

-- ---------------------------------------------------------------------------
-- Cart (as the server)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.cart_update(:A, :T1, 'f1000000-0000-4000-8000-000000000011', 3, 'add') ->> 'subtotal_minor')::bigint, 19500::bigint,
  'Cart subtotal uses database prices');
select is((public.cart_update(:A, :T1, 'f1000000-0000-4000-8000-000000000012', 5, 'add') ->> 'limited')::boolean, true,
  'Quantities are capped at the stock that can be sold');
select throws_ok($$ select public.cart_update('a0000000-0000-4000-8000-00000000000a', '1111111111111111111111111111111111111111111111111111111111111111', 'f1000000-0000-4000-8000-000000000013', 1, 'add') $$,
  '22023', 'out_of_stock', 'Out-of-stock variants cannot be added');
select throws_ok($$ select public.cart_update('a0000000-0000-4000-8000-00000000000a', '1111111111111111111111111111111111111111111111111111111111111111', 'f2000000-0000-4000-8000-000000000011', 1, 'add') $$,
  '22023', 'unavailable', 'Another store''s product cannot be added to this store''s cart');
select throws_ok($$ select public.cart_update('a0000000-0000-4000-8000-00000000000a', '1111111111111111111111111111111111111111111111111111111111111111', 'f1000000-0000-4000-8000-000000000015', 1, 'add') $$,
  '22023', 'unavailable', 'Draft products cannot be added');
select is((public.cart_view(:B, :T1) ->> 'item_count')::int, 0, 'A cart token is scoped to its store');

-- Quotes: 3 × 65.00 + 2 × 220.00 = 635.00; VAT 15 % included = 82.83
select is(public.checkout_quote(:A, :T1, 'pickup', null) - 'problems' - 'item_count',
  '{"subtotal_minor": 63500, "delivery_fee_minor": 0, "tax_minor": 8283, "tax_rate_bps": 1500, "tax_included": true, "total_minor": 63500}'::jsonb,
  'Pickup quote with VAT included');
select is((public.checkout_quote(:A, :T1, 'delivery', '70000000-0000-4000-8000-000000000002') ->> 'delivery_fee_minor')::bigint, 2500::bigint,
  'Delivery zone fee applies');
select is((public.checkout_quote(:A, :T1, 'delivery', '70000000-0000-4000-8000-000000000001') ->> 'delivery_fee_minor')::bigint, 0::bigint,
  'Free delivery above the zone threshold');
select ok(public.checkout_quote(:A, :T1, 'delivery', gen_random_uuid()) -> 'problems' ? 'fulfillment_unavailable',
  'Unknown delivery zones are rejected');
reset role;

update public.tenant_settings set tax = '{"rate_bps": 1000, "included": false}' where tenant_id = :A;
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.checkout_quote(:A, :T1, 'delivery', '70000000-0000-4000-8000-000000000002') ->> 'total_minor')::bigint, 72600::bigint,
  'VAT added on top when prices exclude it (goods + delivery)');
reset role;
update public.tenant_settings set tax = '{"rate_bps": 1500, "included": true}' where tenant_id = :A;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.cart_update(:B, :T3, 'f2000000-0000-4000-8000-000000000011', 1, 'add') ->> 'item_count')::int, 1, 'Store B cart');
select ok(public.checkout_quote(:B, :T3, 'pickup', null) -> 'problems' ? 'ordering_closed', 'A store with ordering off cannot check out');

-- ---------------------------------------------------------------------------
-- Placing orders
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.create_order_from_cart('a0000000-0000-4000-8000-00000000000a', '1111111111111111111111111111111111111111111111111111111111111111',
  '{"fulfillment":"delivery","zone_id":"70000000-0000-4000-8000-000000000002","contact":{"name":"Sara","email":"sara@example.com"},"address":{"line1":"Street 1"},"locale":"en","access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  '22023', 'phone_required', 'Delivery orders need a phone number');
select is(public.create_order_from_cart(:A, :T1,
  '{"fulfillment":"pickup","contact":{"name":"Sara","email":"Sara@Example.com","phone":"+966500000000"},"locale":"ar","marketing_consent":true,"access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') ->> 'total_minor',
  '63500', 'Order total is computed by the database');
reset role;

select is((select array[i.on_hand, i.reserved] from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-1KG'),
  array[2, 2], 'Placing an order reserves stock without deducting it');
select is((select count(*)::int from public.order_items oi join public.orders o on o.id = oi.order_id where o.tenant_id = :A and o.order_number = '1001'), 2,
  'Order lines are snapshotted');
select is((select email::text || ':' || orders_count || ':' || marketing_consent from public.customers where tenant_id = :A), 'sara@example.com:1:true',
  'Customer is created with consent recorded');

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.cart_view(:A, :T1) ->> 'item_count')::int, 0, 'The cart is emptied after checkout');
select is(public.storefront_order(:A, '1001', :K1) ->> 'status', 'pending', 'Customer sees the order with its private link');
select is(public.storefront_order(:A, '1001', repeat('0', 64)), null, 'A wrong link token reveals nothing');
select is(public.storefront_order(:B, '1001', :K1), null, 'Order numbers are scoped to the store');
-- Somebody else buys the last 1 kg bags between adding to cart and checkout.
select is((public.cart_update(:A, :T2, 'f1000000-0000-4000-8000-000000000011', 9, 'add') ->> 'item_count')::int, 7,
  'Second cart is capped at the 7 bags not reserved by the first order');
reset role;
select pg_temp.act_as('11111111-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-250'), -5, 'damage') $$,
  'Owner removes damaged stock');
reset role;
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select throws_ok($$ select public.create_order_from_cart('a0000000-0000-4000-8000-00000000000a', '2222222222222222222222222222222222222222222222222222222222222222',
  '{"fulfillment":"pickup","contact":{"name":"Omar","email":"omar@example.com"},"locale":"en","access_token_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}') $$,
  '22023', '["insufficient_stock"]', 'Stock is checked again when the order is placed');
reset role;

-- ---------------------------------------------------------------------------
-- Staff workflow
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-0000-4000-8000-0000000000e1');
set local role authenticated;
select is((select count(*)::int from public.orders where tenant_id = :A), 0, 'Owner B cannot see A''s orders');
select throws_ok($$ select public.update_order_status((select id from public.orders where order_number = '1001' limit 1), 'confirmed') $$,
  'P0002', null, 'Owner B cannot find (or change) A''s orders');
reset role;

select pg_temp.act_as('11111111-0000-4000-8000-0000000000e2');
set local role authenticated;
select is((select count(*)::int from public.orders where tenant_id = :A), 1, 'Staff A sees A''s orders');
select throws_ok($$ update public.orders set total_minor = 1 where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'Orders cannot be edited directly');
select throws_ok($$ select public.update_order_status((select id from public.orders where tenant_id = 'a0000000-0000-4000-8000-00000000000a'), 'completed') $$,
  '22023', 'invalid_transition', 'Status changes must follow the workflow');
select is(public.update_order_status((select id from public.orders where tenant_id = :A), 'confirmed'), 'confirmed', 'Staff confirms the order');
select is(public.update_order_status((select id from public.orders where tenant_id = :A), 'completed'), 'completed', 'Staff completes the order');
reset role;

select is((select array[i.on_hand, i.reserved] from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-1KG'),
  array[0, 0], 'Completing deducts the reserved stock');
select is((select reason || ':' || delta from public.stock_movements m join public.inventory_items i on i.id = m.inventory_item_id
           join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-1KG' order by m.id desc limit 1), 'sale:-2',
  'The sale is in the stock ledger');

select pg_temp.act_as('11111111-0000-4000-8000-0000000000e2');
set local role authenticated;
select lives_ok($$ select public.record_order_payment((select id from public.orders where tenant_id = 'a0000000-0000-4000-8000-00000000000a'), 'cash') $$,
  'Payment collected at pickup is recorded');
select throws_ok($$ select public.record_order_payment((select id from public.orders where tenant_id = 'a0000000-0000-4000-8000-00000000000a'), 'cash') $$,
  '22023', 'already_paid_or_cancelled', 'A payment cannot be recorded twice');
select throws_ok($$ insert into public.delivery_zones (tenant_id, name) values ('a0000000-0000-4000-8000-00000000000a', '{"en":"x"}') $$,
  '42501', null, 'Staff cannot change delivery settings');
reset role;

select throws_ok($$ update public.tenant_settings set tax = '{"rate_bps": 20000}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'Invalid tax settings are rejected by the database');

select * from finish();
rollback;
