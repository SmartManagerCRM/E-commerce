-- Cross-tenant isolation, role permissions and entitlement tests.
-- Runs against the migrations + dev seed (Tenant A = roasters, Tenant B = coffeehouse).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(53);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Runs a statement as the current role and returns the number of rows affected.
create function tests.affected(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function tests.affected(text) to anon, authenticated;

create function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then '{"role":"anon"}' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
end $$;

\set tenant_a '''a0000000-0000-4000-8000-00000000000a'''
\set tenant_b '''b0000000-0000-4000-8000-00000000000b'''

-- Start from a known membership state regardless of local dev users
-- (everything is rolled back at the end).
alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:tenant_a, :tenant_b);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-000000000001', 'owner-a@test.local'),
  ('11111111-0000-4000-8000-000000000002', 'manager-a@test.local'),
  ('11111111-0000-4000-8000-000000000003', 'staff-a@test.local'),
  ('22222222-0000-4000-8000-000000000001', 'owner-b@test.local'),
  ('33333333-0000-4000-8000-000000000001', 'outsider@test.local'),
  ('99999999-0000-4000-8000-000000000001', 'platform@test.local');

insert into public.tenant_members (tenant_id, user_id, role_id)
select v.tenant_id::uuid, v.user_id::uuid, r.id
from (values
  (:tenant_a, '11111111-0000-4000-8000-000000000001', 'tenant_owner'),
  (:tenant_a, '11111111-0000-4000-8000-000000000002', 'manager'),
  (:tenant_a, '11111111-0000-4000-8000-000000000003', 'staff'),
  (:tenant_b, '22222222-0000-4000-8000-000000000001', 'tenant_owner')
) as v(tenant_id, user_id, role_key)
join public.roles r on r.is_system and r.key = v.role_key;

insert into public.platform_admins (user_id) values ('99999999-0000-4000-8000-000000000001');

-- ===========================================================================
-- Owner of Tenant A
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-000000000001');
set local role authenticated;

select results_eq($$ select slug from public.tenants $$, array['roasters'], 'Owner A sees only Tenant A');
select is((select count(*)::int from public.tenant_settings where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B settings');
select is((select count(*)::int from public.storefront_configs where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B storefront config');
select is((select count(*)::int from public.branches where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B branches');
select is((select count(*)::int from public.tenant_members where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B members');
select is((select count(*)::int from public.tenant_domains where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B domains');
select is((select count(*)::int from public.tenant_subscriptions where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B subscription');
select is((select count(*)::int from public.audit_logs where tenant_id = :tenant_b), 0, 'Owner A cannot read Tenant B audit log');
select is((select count(*)::int from public.profiles where id = '22222222-0000-4000-8000-000000000001'), 0, 'Owner A cannot read Owner B profile');

select is(tests.affected($$ update public.tenants set business_name = 'hacked' where id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot update Tenant B');
select is(tests.affected($$ update public.tenant_settings set checkout = '{"x":1}' where tenant_id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot update Tenant B settings');
select is(tests.affected($$ update public.storefront_configs set theme_key = 'luxury' where tenant_id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot update Tenant B appearance');
select is(tests.affected($$ delete from public.branches where tenant_id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot delete Tenant B branches');
select is(tests.affected($$ delete from public.tenant_members where tenant_id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot remove Tenant B members');

select throws_ok(
  $$ insert into public.tenant_members (tenant_id, user_id, role_id)
     select 'b0000000-0000-4000-8000-00000000000b', '11111111-0000-4000-8000-000000000001', id
     from public.roles where key = 'tenant_owner' $$,
  '42501', null, 'Owner A cannot add themselves to Tenant B');
select throws_ok(
  $$ insert into public.branches (tenant_id, name, slug) values ('b0000000-0000-4000-8000-00000000000b', '{"en":"X"}', 'x') $$,
  '42501', null, 'Owner A cannot create a branch in Tenant B');
select throws_ok(
  $$ insert into public.tenant_domains (tenant_id, hostname, verified_at) values ('a0000000-0000-4000-8000-00000000000a', 'evil.test', now()) $$,
  '42501', null, 'Tenant owners cannot attach an already-verified domain');
select throws_ok(
  $$ select public.tenant_admin_context('b0000000-0000-4000-8000-00000000000b') $$,
  '42501', null, 'Owner A cannot load the Tenant B admin context');
select throws_ok(
  $$ insert into public.platform_admins (user_id) values ('11111111-0000-4000-8000-000000000001') $$,
  '42501', null, 'Owner A cannot make themselves a platform admin');
select throws_ok(
  $$ insert into public.tenant_subscriptions (tenant_id, plan_id, status)
     select 'a0000000-0000-4000-8000-00000000000a', id, 'active' from public.plans where key = 'professional' $$,
  '42501', null, 'Owner A cannot grant their tenant a subscription');
select throws_ok(
  $$ insert into public.tenant_feature_overrides (tenant_id, feature_key, enabled) values ('a0000000-0000-4000-8000-00000000000a', 'ai_assistant', true) $$,
  '42501', null, 'Owner A cannot override their own entitlements');

select is(tests.affected($$ update public.tenants set business_name = 'Roasters Café & Co' where id = 'a0000000-0000-4000-8000-00000000000a' $$), 1, 'Owner A can update their own business profile');
select throws_ok($$ update public.tenants set status = 'closed' where id = 'a0000000-0000-4000-8000-00000000000a' $$, '42501', null, 'Owner A cannot change their tenant status');
select throws_ok($$ update public.tenants set slug = 'coffeehouse2' where id = 'a0000000-0000-4000-8000-00000000000a' $$, '42501', null, 'Owner A cannot change their tenant slug');
select throws_ok($$ delete from public.tenant_members where user_id = '11111111-0000-4000-8000-000000000001' $$, '23514', null, 'The last owner cannot be removed');
select lives_ok($$ insert into public.branches (tenant_id, name, slug) values ('a0000000-0000-4000-8000-00000000000a', '{"en":"Jeddah"}', 'jeddah') $$, 'Owner A (Professional plan) can add a branch');
select throws_ok($$ delete from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default $$, '23514', null, 'The default branch cannot be deleted');
select results_eq($$ select slug from public.my_memberships() $$, array['roasters'], 'my_memberships() lists only Tenant A');
select is((public.tenant_admin_context(:tenant_a) -> 'features' -> 'booking' ->> 'enabled')::boolean, true, 'Tenant A (Professional) has booking');
select ok((public.tenant_admin_context(:tenant_a) -> 'permissions') ? 'settings.write', 'Owner has every permission');
select ok((select count(*) from public.audit_logs where tenant_id = :tenant_a) > 0, 'Owner A can read Tenant A audit log');

reset role;

-- ===========================================================================
-- Owner of Tenant B (Starter plan)
-- ===========================================================================
select tests.act_as('22222222-0000-4000-8000-000000000001');
set local role authenticated;

select results_eq($$ select slug from public.tenants $$, array['coffeehouse'], 'Owner B sees only Tenant B');
select is((select count(*)::int from public.tenant_settings where tenant_id = :tenant_a), 0, 'Owner B cannot read Tenant A settings');
select is((select count(*)::int from public.branches where tenant_id = :tenant_a), 0, 'Owner B cannot read Tenant A branches');
select throws_ok(
  $$ insert into public.branches (tenant_id, name, slug) values ('b0000000-0000-4000-8000-00000000000b', '{"en":"Lyon"}', 'lyon') $$,
  '42501', null, 'Starter plan cannot add branches (multi_branch entitlement)');
select is((public.tenant_admin_context(:tenant_b) -> 'features' -> 'booking' ->> 'enabled')::boolean, false, 'Tenant B (Starter) does not have booking');
reset role;

-- ===========================================================================
-- Staff and manager of Tenant A
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-000000000003');
set local role authenticated;
select is(tests.affected($$ update public.tenants set business_name = 'x' where id = 'a0000000-0000-4000-8000-00000000000a' $$), 0, 'Staff cannot edit the business profile');
select is((select count(*)::int from public.tenant_settings), 0, 'Staff cannot read settings');
select is((select count(*)::int from public.audit_logs), 0, 'Staff cannot read the audit log');
select throws_ok(
  $$ insert into public.tenant_members (tenant_id, user_id, role_id)
     select 'a0000000-0000-4000-8000-00000000000a', '33333333-0000-4000-8000-000000000001', id from public.roles where key = 'admin' $$,
  '42501', null, 'Staff cannot add members');
reset role;

select tests.act_as('11111111-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.tenant_settings), 1, 'Manager can read Tenant A settings');
select is(tests.affected($$ update public.storefront_configs set theme_key = 'luxury' $$), 0, 'Manager cannot change appearance');
select throws_ok(
  $$ insert into public.roles (tenant_id, key, name) values ('a0000000-0000-4000-8000-00000000000a', 'superuser', '{"en":"Super"}') $$,
  '42501', null, 'Manager cannot create custom roles (privilege escalation)');
select is(tests.affected(
  $$ update public.tenant_members set role_id = (select id from public.roles where key = 'tenant_owner')
     where user_id = '11111111-0000-4000-8000-000000000002' $$), 0, 'Manager cannot promote themselves');
reset role;

-- ===========================================================================
-- Authenticated user with no membership
-- ===========================================================================
select tests.act_as('33333333-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.tenants), 0, 'Outsider sees no tenants');
select throws_ok($$ select public.tenant_admin_context('a0000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Outsider cannot load an admin context');
reset role;

-- ===========================================================================
-- Anonymous visitor
-- ===========================================================================
select tests.act_as(null);
set local role anon;
select throws_ok($$ select * from public.tenants $$, '42501', null, 'anon cannot read tenants directly');
select throws_ok($$ select * from public.tenant_members $$, '42501', null, 'anon cannot read memberships');
select is(public.resolve_storefront(null, 'roasters') ->> 'business_name', 'Roasters Café & Co', 'anon resolves a storefront by slug');
select is(public.resolve_storefront('unknown.example') , null, 'Unknown hostnames resolve to nothing');
reset role;

-- ===========================================================================
-- Platform admin
-- ===========================================================================
select count(*)::int as total_tenants from public.tenants \gset
select tests.act_as('99999999-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.tenants), :total_tenants, 'Platform admin sees all tenants');
select is(tests.affected($$ update public.tenants set status = 'suspended' where slug = 'coffeehouse' $$), 1, 'Platform admin can suspend a tenant');
select ok(not (public.resolve_storefront('coffeehouse.test') ? 'phone'), 'Suspended storefront exposes only minimal data');
reset role;

select * from finish();
rollback;
