-- Phase 2: invitations, platform operations, custom domains, storage isolation.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(39);

create schema tests;
grant usage on schema tests to anon, authenticated;
create table tests.vars (key text primary key, value text);
grant all on tests.vars to anon, authenticated;

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

create function tests.var(k text) returns text language sql as $$ select value from tests.vars where key = k $$;
grant execute on function tests.var(text) to anon, authenticated;

\set tenant_a '''a0000000-0000-4000-8000-00000000000a'''
\set tenant_b '''b0000000-0000-4000-8000-00000000000b'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:tenant_a, :tenant_b);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
delete from public.tenant_invitations where tenant_id in (:tenant_a, :tenant_b);

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000a1', 'p2-owner-a@test.local'),
  ('11111111-0000-4000-8000-0000000000a2', 'p2-admin-a@test.local'),
  ('11111111-0000-4000-8000-0000000000a3', 'p2-staff-a@test.local'),
  ('22222222-0000-4000-8000-0000000000b1', 'p2-owner-b@test.local'),
  ('44444444-0000-4000-8000-000000000001', 'p2-invitee@test.local'),
  ('44444444-0000-4000-8000-000000000002', 'p2-someone-else@test.local'),
  ('99999999-0000-4000-8000-0000000000f1', 'p2-platform@test.local');

insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id
from (values
  (:tenant_a, '11111111-0000-4000-8000-0000000000a1', 'tenant_owner'),
  (:tenant_a, '11111111-0000-4000-8000-0000000000a2', 'admin'),
  (:tenant_a, '11111111-0000-4000-8000-0000000000a3', 'staff'),
  (:tenant_b, '22222222-0000-4000-8000-0000000000b1', 'tenant_owner')
) v(t, u, role_key) join public.roles r on r.is_system and r.key = v.role_key;

insert into public.platform_admins (user_id) values ('99999999-0000-4000-8000-0000000000f1');

-- ===========================================================================
-- Invitations
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-0000000000a1');
set local role authenticated;
insert into tests.vars values ('tok_a', public.invite_member(:tenant_a, 'p2-invitee@test.local', 'manager'));
select ok(length(tests.var('tok_a')) = 64, 'Owner A can invite a manager and receives a 256-bit token');
select is((select count(*)::int from public.tenant_invitations where tenant_id = :tenant_a), 1, 'Owner A sees the pending invitation');
select throws_ok($$ select token_hash from public.tenant_invitations $$, '42501', null, 'Token hashes are not readable by clients');
select throws_ok($$ select public.invite_member('b0000000-0000-4000-8000-00000000000b', 'x@test.local', 'staff') $$,
  '42501', null, 'Owner A cannot invite into Tenant B');
select throws_ok($$ select public.invite_member('a0000000-0000-4000-8000-00000000000a', 'p2-staff-a@test.local', 'staff') $$,
  '23505', null, 'Existing members cannot be invited again');
reset role;

select tests.act_as('11111111-0000-4000-8000-0000000000a2');
set local role authenticated;
select lives_ok($$ select public.invite_member('a0000000-0000-4000-8000-00000000000a', 'p2-new-staff@test.local', 'staff') $$,
  'Admins (staff.write) can invite staff');
select throws_ok($$ select public.invite_member('a0000000-0000-4000-8000-00000000000a', 'p2-new-owner@test.local', 'tenant_owner') $$,
  '42501', null, 'Admins cannot invite owners');
reset role;

select tests.act_as('11111111-0000-4000-8000-0000000000a3');
set local role authenticated;
select throws_ok($$ select public.invite_member('a0000000-0000-4000-8000-00000000000a', 'p2-x@test.local', 'staff') $$,
  '42501', null, 'Staff cannot invite');
select throws_ok($$ select public.tenant_staff('a0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Staff cannot list staff emails');
reset role;

select tests.act_as('22222222-0000-4000-8000-0000000000b1');
set local role authenticated;
select is((select count(*)::int from public.tenant_invitations where tenant_id = :tenant_a), 0, 'Owner B cannot see Tenant A invitations');
select throws_ok($$ select public.revoke_invitation((select id from public.tenant_invitations limit 1)) $$,
  '42501', null, 'Owner B cannot revoke Tenant A invitations');
select throws_ok($$ select public.tenant_staff('a0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Owner B cannot list Tenant A staff');
reset role;

-- Anonymous preview and acceptance
select tests.act_as(null);
set local role anon;
select is(public.get_invitation(tests.var('tok_a')) ->> 'business_name', 'Roasters Café', 'Invitation preview works with the token');
select is(public.get_invitation(repeat('0', 64)), null, 'Unknown tokens reveal nothing');
select throws_ok($$ select public.accept_invitation(tests.var('tok_a')) $$, '42501', null, 'anon cannot accept');
reset role;

select tests.act_as('44444444-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$ select public.accept_invitation(tests.var('tok_a')) $$, '42501', null, 'A different account cannot accept someone else''s invitation');
reset role;

select tests.act_as('44444444-0000-4000-8000-000000000001');
set local role authenticated;
select is(public.accept_invitation(tests.var('tok_a')), 'roasters', 'The invitee accepts and gets the tenant slug');
select is((public.tenant_admin_context(:tenant_a) ->> 'role_key'), 'manager', 'The invitee is now a manager of Tenant A');
select throws_ok($$ select public.accept_invitation(tests.var('tok_a')) $$, '23505', null, 'An invitation can only be used once');
reset role;

-- Expired invitations
select tests.act_as('11111111-0000-4000-8000-0000000000a1');
set local role authenticated;
insert into tests.vars values ('tok_exp', public.invite_member(:tenant_a, 'p2-someone-else@test.local', 'staff'));
reset role;
update public.tenant_invitations set expires_at = now() - interval '1 minute' where token_hash = app.hash_token(tests.var('tok_exp'));
select tests.act_as('44444444-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$ select public.accept_invitation(tests.var('tok_exp')) $$, '22023', null, 'Expired invitations are rejected');
reset role;

-- Staff limit (Starter plan: max_staff = 2) on Tenant B
select tests.act_as('22222222-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok($$ select public.invite_member('b0000000-0000-4000-8000-00000000000b', 'p2-b1@test.local', 'staff') $$, 'Starter plan: second seat can be invited');
select throws_ok($$ select public.invite_member('b0000000-0000-4000-8000-00000000000b', 'p2-b2@test.local', 'staff') $$,
  '53400', null, 'Starter plan: the staff limit is enforced');
reset role;

-- ===========================================================================
-- Platform operations
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-0000000000a1');
set local role authenticated;
select throws_ok($$ select public.platform_create_tenant('evil', 'Evil', 'cafe', 'SAR', 'UTC', 'en', array['en'], 'SA', 'X', 'professional', 'e@test.local') $$,
  '42501', null, 'Tenant owners cannot create tenants');
select throws_ok($$ select public.platform_set_plan('a0000000-0000-4000-8000-00000000000a', 'professional') $$,
  '42501', null, 'Tenant owners cannot change their plan');
reset role;

select tests.act_as('99999999-0000-4000-8000-0000000000f1');
set local role authenticated;
insert into tests.vars values ('new_tenant', public.platform_create_tenant('newcafe', 'New Café', 'cafe', 'sar', 'Asia/Riyadh', 'ar', array['ar','en'], 'sa', 'Jeddah', 'business', 'p2-newowner@test.local')::text);
select is((select status from public.tenants where slug = 'newcafe'), 'onboarding', 'Platform admin creates a tenant in onboarding state');
select is((select count(*)::int from public.branches b join public.tenants t on t.id = b.tenant_id where t.slug = 'newcafe'), 1, 'New tenant gets its default branch');
select is((select p.key from public.tenant_subscriptions s join public.plans p on p.id = s.plan_id join public.tenants t on t.id = s.tenant_id where t.slug = 'newcafe'), 'business', 'New tenant is on the chosen plan');
select ok(length((tests.var('new_tenant')::jsonb) ->> 'invitation_token') = 64, 'An owner invitation is created with the tenant');
select throws_ok($$ select public.platform_create_tenant('roasters', 'Dup', 'cafe', 'SAR', 'UTC', 'en', array['en'], null, null, 'starter', 'd@test.local') $$,
  '23505', null, 'Slugs are unique');
select lives_ok($$ select public.platform_set_plan('b0000000-0000-4000-8000-00000000000b', 'business') $$, 'Platform admin changes a plan');
select is((select count(*)::int from public.tenant_subscriptions where tenant_id = :tenant_b and status in ('trialing','active','past_due')), 1, 'Exactly one current subscription after a plan change');
reset role;

-- ===========================================================================
-- Custom domains
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-0000000000a1');
set local role authenticated;
select lives_ok($$ insert into public.tenant_domains (tenant_id, hostname) values ('a0000000-0000-4000-8000-00000000000a', 'shop.roasters-example.com') $$,
  'Owner A can request a custom domain');
select throws_ok($$ insert into public.tenant_domains (tenant_id, hostname, verified_at) values ('a0000000-0000-4000-8000-00000000000a', 'fake.roasters-example.com', now()) $$,
  '42501', null, 'Owners cannot mark a domain verified themselves');
select throws_ok($$ insert into public.tenant_domains (tenant_id, hostname) values ('b0000000-0000-4000-8000-00000000000b', 'steal.example.com') $$,
  '42501', null, 'Owner A cannot add a domain to Tenant B');
select is(tests.affected($$ update public.tenant_domains set verified_at = now() where hostname = 'shop.roasters-example.com' $$), 0,
  'Owners cannot verify a domain by updating it');
select throws_ok($$ select public.set_primary_domain((select id from public.tenant_domains where hostname = 'shop.roasters-example.com')) $$,
  '22023', null, 'Unverified domains cannot become primary');
reset role;

-- ===========================================================================
-- Storage folder isolation
-- ===========================================================================
select tests.act_as('11111111-0000-4000-8000-0000000000a1');
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('tenant-public', 'a0000000-0000-4000-8000-00000000000a/branding/logo.webp', '11111111-0000-4000-8000-0000000000a1') $$,
  'Owner A can upload into Tenant A''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('tenant-public', 'b0000000-0000-4000-8000-00000000000b/branding/logo.webp', '11111111-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'Owner A cannot upload into Tenant B''s folder');
reset role;

select tests.act_as('11111111-0000-4000-8000-0000000000a3');
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('tenant-public', 'a0000000-0000-4000-8000-00000000000a/branding/x.webp') $$,
  '42501', null, 'Staff without media/appearance permission cannot upload');
reset role;

select * from finish();
rollback;
