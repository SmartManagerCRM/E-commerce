-- Phase 9: loyalty settings, tiers, automatic point accrual on paid orders,
-- staff-redeemed rewards, and tenant/permission isolation.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

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
  ('77777777-0000-4000-8000-0000000000e1', 'p9-owner-a@test.local'),
  ('77777777-0000-4000-8000-0000000000e2', 'p9-staff-a@test.local'),
  ('77777777-0000-4000-8000-0000000000e3', 'p9-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '77777777-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '77777777-0000-4000-8000-0000000000e2', 'staff'),
  (:B, '77777777-0000-4000-8000-0000000000e3', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active', currency = 'SAR' where id in (:A, :B);
update public.tenant_settings set loyalty = '{"active": true, "points_per_currency_unit": 1}' where tenant_id = :A;

-- ---------------------------------------------------------------------------
-- Settings: feature-gated, safe defaults
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(public.loyalty_settings(:A) ->> 'active', 'true', 'Loyalty is on for Store A (professional plan has the feature)');
select is(public.loyalty_settings(:A) ->> 'points_per_currency_unit', '1', 'Configured rate is read back');
reset role;

-- ---------------------------------------------------------------------------
-- Tiers and rewards: permission-checked, tenant-scoped
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select * from public.loyalty_tiers $$, '42501', null, 'anon cannot read loyalty tiers');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e2');
set local role authenticated;
select is((select count(*)::int from public.loyalty_tiers), 0, 'Staff (customers.read) can read tiers (none yet)');
select throws_ok($$ insert into public.loyalty_tiers (tenant_id, name, threshold_points) values
  ('a0000000-0000-4000-8000-00000000000a', '{"en":"Bronze"}', 0) $$,
  '42501', null, 'Staff without marketing.write cannot create a tier');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ insert into public.loyalty_tiers (tenant_id, name, threshold_points, position) values
  ('a0000000-0000-4000-8000-00000000000a', '{"en":"Bronze"}', 0, 0),
  ('a0000000-0000-4000-8000-00000000000a', '{"en":"Silver"}', 100, 1) $$,
  'Owner (marketing.write) creates two tiers');
select lives_ok($$ insert into public.loyalty_rewards (tenant_id, name, cost_points, kind, value) values
  ('a0000000-0000-4000-8000-00000000000a', '{"en":"10 SAR off"}', 50, 'discount_fixed', 1000) $$,
  'Owner creates a reward (50 points -> 10 SAR off)');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.loyalty_tiers where tenant_id = :A), 0, 'Owner B cannot see Store A''s tiers');
select is((select count(*)::int from public.loyalty_rewards where tenant_id = :A), 0, 'Owner B cannot see Store A''s rewards');
reset role;

-- ---------------------------------------------------------------------------
-- Earning points: automatic, idempotent, on a paid order
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
insert into public.customers (id, tenant_id, email, full_name) values
  ('88888888-0000-4000-8000-0000000000c1', :A, 'loyal@example.com', 'Loyal Customer');
insert into public.orders (id, tenant_id, branch_id, customer_id, order_number, fulfillment_type, subtotal_minor,
    total_minor, currency, contact, access_token_hash) values
  ('99999999-0000-4000-8000-000000000001', :A,
   (select id from public.branches where tenant_id = :A and is_default),
   '88888888-0000-4000-8000-0000000000c1', 'LOY-1', 'pickup', 5000, 5000, 'SAR',
   '{"name":"Loyal Customer","email":"loyal@example.com"}',
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select public.record_order_payment('99999999-0000-4000-8000-000000000001', 'cash') $$,
  'Owner records a manual payment on the order');
reset role;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((select delta from public.loyalty_ledger where order_id = '99999999-0000-4000-8000-000000000001'), 50,
  '50 SAR at 1 point/SAR earns 50 points');
select is(public.loyalty_balance(:A, '88888888-0000-4000-8000-0000000000c1') ->> 'balance', '50', 'Balance reflects the earned points');
select is(public.loyalty_balance(:A, '88888888-0000-4000-8000-0000000000c1') -> 'tier' ->> 'name', '{"en": "Bronze"}',
  '50 lifetime points places the customer in the Bronze tier (below Silver''s 100)');

-- Calling the accrual function again for the same order is a no-op (the
-- partial unique index makes this idempotent, independent of the fact that
-- record_order_payment itself also refuses a second payment on the order).
select lives_ok($$ select app.award_loyalty_points(o) from public.orders o where o.id = '99999999-0000-4000-8000-000000000001' $$,
  'Awarding points twice for the same order does not throw');
select is((select count(*)::int from public.loyalty_ledger where order_id = '99999999-0000-4000-8000-000000000001'), 1,
  'Still exactly one earned_order row for that order');
reset role;

-- ---------------------------------------------------------------------------
-- Redeeming a reward and manual adjustments: staff-only, balance-checked
-- ---------------------------------------------------------------------------
select pg_temp.act_as('77777777-0000-4000-8000-0000000000e2');
set local role authenticated;
select throws_ok($$ select public.redeem_loyalty_reward('a0000000-0000-4000-8000-00000000000a',
  '88888888-0000-4000-8000-0000000000c1', (select id from public.loyalty_rewards where tenant_id = 'a0000000-0000-4000-8000-00000000000a')) $$,
  '42501', null, 'Staff without marketing.write cannot redeem a reward on the customer''s behalf');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e1');
set local role authenticated;
select is((public.redeem_loyalty_reward(:A, '88888888-0000-4000-8000-0000000000c1',
  (select id from public.loyalty_rewards where tenant_id = :A)) ->> 'kind'), 'discount_fixed',
  'Owner redeems the reward and gets back its details to apply manually');
select is(public.loyalty_balance(:A, '88888888-0000-4000-8000-0000000000c1') ->> 'balance', '0',
  'Balance is spent down by the reward''s cost');
select is(public.loyalty_balance(:A, '88888888-0000-4000-8000-0000000000c1') -> 'tier' ->> 'name', '{"en": "Bronze"}',
  'Redeeming does not demote the tier (tier is based on lifetime points, not spendable balance)');

select throws_ok($$ select public.redeem_loyalty_reward('a0000000-0000-4000-8000-00000000000a',
  '88888888-0000-4000-8000-0000000000c1', (select id from public.loyalty_rewards where tenant_id = 'a0000000-0000-4000-8000-00000000000a')) $$,
  '22023', 'insufficient_points', 'Redeeming again with an empty balance is rejected');

select lives_ok($$ select public.adjust_loyalty_points('a0000000-0000-4000-8000-00000000000a',
  '88888888-0000-4000-8000-0000000000c1'::uuid, 20, 'Goodwill for a late order') $$,
  'Owner makes a manual +20 point adjustment');
select is(public.loyalty_balance(:A, '88888888-0000-4000-8000-0000000000c1') ->> 'balance', '20',
  'The manual adjustment is reflected in the balance');
select throws_ok($$ select public.adjust_loyalty_points('a0000000-0000-4000-8000-00000000000a',
  '88888888-0000-4000-8000-0000000000c1'::uuid, 0, null) $$,
  '22023', 'invalid_delta', 'A zero-point adjustment is rejected');
reset role;

select pg_temp.act_as('77777777-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.loyalty_ledger where tenant_id = :A), 0,
  'Owner B cannot see Store A''s loyalty ledger');
select throws_ok($$ select public.adjust_loyalty_points('a0000000-0000-4000-8000-00000000000a',
  '88888888-0000-4000-8000-0000000000c1'::uuid, 10, null) $$,
  '42501', null, 'Owner B cannot adjust Store A''s customer points');
reset role;

-- ---------------------------------------------------------------------------
-- Ledger integrity: reasons are constrained and linked correctly
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select throws_ok($$ insert into public.loyalty_ledger (tenant_id, customer_id, delta, reason) values
  ('a0000000-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-0000000000c1', 5, 'not_a_real_reason') $$,
  '23514', null, 'An unknown ledger reason is rejected');
select throws_ok($$ insert into public.loyalty_ledger (tenant_id, customer_id, delta, reason) values
  ('a0000000-0000-4000-8000-00000000000a', '88888888-0000-4000-8000-0000000000c1', 5, 'earned_order') $$,
  '23514', null, 'earned_order requires a positive delta and an order_id');
reset role;

select * from finish();
rollback;
