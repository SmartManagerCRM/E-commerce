-- Phase 6: Moyasar provider configuration, online checkout, idempotent
-- payment confirmation, and the expiry sweep for unpaid holds.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

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
\set T2 '''5555555555555555555555555555555555555555555555555555555555555555'''
\set T3 '''6666666666666666666666666666666666666666666666666666666666666666'''
\set K1 '''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:A, :B);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
insert into auth.users (id, email) values
  ('33333333-0000-4000-8000-0000000000e1', 'p6-owner-a@test.local'),
  ('33333333-0000-4000-8000-0000000000e2', 'p6-staff-a@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '33333333-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '33333333-0000-4000-8000-0000000000e2', 'staff')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active' where id in (:A, :B);
update public.tenant_settings set
  checkout = '{"accepting_orders": true, "pickup": true, "delivery": false, "pay_on_fulfillment": false}',
  tax = '{"rate_bps": 0, "included": true}'
where tenant_id = :A;
update public.inventory_items i set on_hand = 5, reserved = 0, allow_backorder = false, track_stock = true
from public.product_variants v where v.id = i.variant_id and v.sku = 'ETH-YIR-250' and v.tenant_id = :A;

-- ---------------------------------------------------------------------------
-- Provider configuration: permission-checked, secrets never selectable
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select public.save_payment_provider('a0000000-0000-4000-8000-00000000000a', 'moyasar', 'test', 'pk_test_x', 'sk_test_x', 'whsec_x', array['creditcard'], true) $$,
  '42501', null, 'anon cannot save a provider config');
select throws_ok($$ select * from public.payment_provider_configs $$, '42501', null, 'anon cannot read provider configs');
reset role;

select pg_temp.act_as('33333333-0000-4000-8000-0000000000e2');
set local role authenticated;
select throws_ok($$ select public.save_payment_provider('a0000000-0000-4000-8000-00000000000a', 'moyasar', 'test', 'pk_test_x', 'sk_test_x', 'whsec_x', array['creditcard'], true) $$,
  '42501', null, 'staff without settings.write cannot configure payments');
reset role;

select pg_temp.act_as('33333333-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.save_payment_provider('a0000000-0000-4000-8000-00000000000a', 'tap', 'test', 'pk_test_x', 'sk_test_x', 'whsec_x', array['creditcard'], true) $$,
  '22023', 'invalid_provider', 'Only moyasar is a supported provider so far');
select lives_ok($$ select public.save_payment_provider('a0000000-0000-4000-8000-00000000000a', 'moyasar', 'test', 'pk_test_123', 'sk_test_123', 'whsec_123', array['creditcard','mada'], true) $$,
  'Owner configures Moyasar test keys');
select is((select public_config ->> 'publishable_key' from public.payment_provider_configs where tenant_id = :A), 'pk_test_123',
  'The publishable key is readable back');
select is((select secret_vault_id is not null from public.payment_provider_configs where tenant_id = :A), true,
  'The secret key is stored by reference (Vault), not in the row');
reset role;

select pg_temp.act_as('33333333-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.payment_provider_secret('a0000000-0000-4000-8000-00000000000a', 'moyasar') $$,
  '42501', null, 'Only service_role may read the decrypted secret, not even the tenant owner');
reset role;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(public.payment_provider_secret(:A, 'moyasar') ->> 'secret_key', 'sk_test_123', 'service_role reads the decrypted secret for the outbound call');
select is(public.storefront_payment_options(:A) ->> 'available', 'true', 'Storefront sees online payment as available');
reset role;

-- Updating without a new secret keeps the working one.
select pg_temp.act_as('33333333-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select public.save_payment_provider('a0000000-0000-4000-8000-00000000000a', 'moyasar', 'test', 'pk_test_456', '', '', array['creditcard'], true) $$,
  'Owner updates the publishable key without re-entering secrets');
reset role;
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(public.payment_provider_secret(:A, 'moyasar') ->> 'secret_key', 'sk_test_123', 'The previously-saved secret key is unchanged');
reset role;

-- ---------------------------------------------------------------------------
-- Online checkout: pending_payment, 15-minute hold, reservation without deduction
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select throws_ok($$ select public.create_order_from_cart('b0000000-0000-4000-8000-00000000000b', 'x',
  '{"fulfillment":"pickup","payment_method":"online","contact":{"name":"X","email":"x@example.com"},"locale":"en","access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') $$,
  '22023', 'empty_cart', 'Store B has no active provider or cart to order online with');
select is((public.cart_update(:A, :T1, 'f1000000-0000-4000-8000-000000000011', 2, 'add') ->> 'item_count')::int, 2, 'Cart has 2 bags');
select is(public.create_order_from_cart(:A, :T1,
  '{"fulfillment":"pickup","payment_method":"online","contact":{"name":"Lina","email":"lina@example.com"},"locale":"en","access_token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') ->> 'status',
  'pending_payment', 'An online order starts pending_payment');
select is((select array[on_hand, reserved] from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-250'),
  array[5, 2], 'Stock is reserved for a pending_payment order, not deducted');
select is((select expires_at is not null from public.orders where tenant_id = :A and order_number = '1001'), true, 'A 15-minute payment hold is set');
select is((select payment_intent_ref is null from public.orders where tenant_id = :A and order_number = '1001'), true, 'No provider reference yet');
select lives_ok($$ select public.set_payment_intent_ref((select id from public.orders where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and order_number = '1001'), 'inv_test_1') $$,
  'Server code stores the provider reference after creating the payment session');
reset role;

-- ---------------------------------------------------------------------------
-- confirm_online_payment: idempotent, amount-checked, the single entry point
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.confirm_online_payment('moyasar', 'inv_test_1', true, 1::bigint, 'SAR', 'evt_1', 'card') $$,
  '22023', 'amount_mismatch', 'A mismatched amount is rejected even if the reference is right');
select throws_ok($$ select public.confirm_online_payment('moyasar', 'inv_unknown', true, 9000::bigint, 'SAR', 'evt_2', 'card') $$,
  '22023', 'unknown_reference', 'An unrecognised reference is rejected');
select is(public.confirm_online_payment('moyasar', 'inv_test_1', true,
  (select total_minor from public.orders where tenant_id = :A and order_number = '1001'), 'SAR', 'evt_3', 'card') ->> 'result',
  'confirmed', 'A matching payment confirms the order');
select is((select status || ':' || payment_status from public.orders where tenant_id = :A and order_number = '1001'), 'pending:paid',
  'The order moves to pending and paid once payment is confirmed');
select is((select count(*)::int from public.payments where order_id = (select id from public.orders where tenant_id = :A and order_number = '1001')), 1,
  'One payment row is recorded');
select is(public.confirm_online_payment('moyasar', 'inv_test_1', true,
  (select total_minor from public.orders where tenant_id = :A and order_number = '1001'), 'SAR', 'evt_3', 'card') ->> 'result',
  'already_processed', 'A duplicate webhook delivery (same event id) is a no-op');
select is((select count(*)::int from public.payments where order_id = (select id from public.orders where tenant_id = :A and order_number = '1001')), 1,
  'No duplicate payment row is created');
reset role;

-- ---------------------------------------------------------------------------
-- A second, still-unpaid online order: staff can only cancel it, never hand-advance it
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.cart_update(:A, :T2, 'f1000000-0000-4000-8000-000000000011', 1, 'add') ->> 'item_count')::int, 1, 'Cart for a second online order');
select public.create_order_from_cart(:A, :T2,
  '{"fulfillment":"pickup","payment_method":"online","contact":{"name":"Omar","email":"omar2@example.com"},"locale":"en","access_token_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}');
reset role;

select pg_temp.act_as('33333333-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.update_order_status((select id from public.orders where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and order_number = '1002'), 'confirmed') $$,
  '22023', 'invalid_transition', 'An unpaid online order cannot be hand-advanced to confirmed');
select is(public.update_order_status((select id from public.orders where tenant_id = :A and order_number = '1002'), 'cancelled'), 'cancelled',
  'Staff may still cancel an unpaid online order directly');
reset role;

-- ---------------------------------------------------------------------------
-- Expiry sweep: an unpaid hold past its 15 minutes is cancelled and released
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.cart_update(:A, :T3, 'f1000000-0000-4000-8000-000000000011', 1, 'add') ->> 'item_count')::int, 1, 'Cart for a third online order');
select public.create_order_from_cart(:A, :T3,
  '{"fulfillment":"pickup","payment_method":"online","contact":{"name":"Omar","email":"omar3@example.com"},"locale":"en","access_token_hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}');
update public.orders set expires_at = now() - interval '1 minute' where tenant_id = :A and order_number = '1003';
select is(app.expire_pending_payments(), 1, 'The sweep cancels exactly the one expired order');
select is((select status || ':' || cancel_reason from public.orders where tenant_id = :A and order_number = '1003'), 'cancelled:payment_expired',
  'The expired order is cancelled with a clear reason');
-- Order 1001 (paid, still only reserved — completion/deduction is unchanged from Phase 5) holds 2;
-- orders 1002 (staff-cancelled) and 1003 (expired) both released their 1-bag reservation.
select is((select array[on_hand, reserved] from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'ETH-YIR-250'),
  array[5, 2], 'Only the paid order''s reservation remains; the two unpaid ones were released');
reset role;

select * from finish();
rollback;
