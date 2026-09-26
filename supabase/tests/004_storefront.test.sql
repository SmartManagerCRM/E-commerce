-- Phase 3: newsletter sign-ups and storefront resolution.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then '{"role":"anon"}' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
end $$;

\set tenant_a '''a0000000-0000-4000-8000-00000000000a'''
\set tenant_b '''b0000000-0000-4000-8000-00000000000b'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:tenant_a, :tenant_b);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
delete from public.newsletter_subscribers where tenant_id in (:tenant_a, :tenant_b);
update public.tenants set status = 'active' where id in (:tenant_a, :tenant_b);

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000c1', 'p3-owner-a@test.local'),
  ('11111111-0000-4000-8000-0000000000c2', 'p3-staff-a@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select :tenant_a, v.u::uuid, r.id
from (values ('11111111-0000-4000-8000-0000000000c1', 'tenant_owner'), ('11111111-0000-4000-8000-0000000000c2', 'staff')) v(u, k)
join public.roles r on r.is_system and r.key = v.k;

-- Privileges: only the service role may write sign-ups.
select ok(not has_function_privilege('anon', 'public.newsletter_subscribe(uuid,text,text,text)', 'execute'), 'anon cannot call newsletter_subscribe');
select ok(not has_function_privilege('authenticated', 'public.newsletter_subscribe(uuid,text,text,text)', 'execute'), 'authenticated cannot call newsletter_subscribe');
select ok(has_function_privilege('service_role', 'public.newsletter_subscribe(uuid,text,text,text)', 'execute'), 'service_role can call newsletter_subscribe');
select ok(not has_table_privilege('anon', 'public.newsletter_subscribers', 'select'), 'anon cannot read subscribers');
select ok(not has_table_privilege('authenticated', 'public.newsletter_subscribers', 'insert'), 'clients cannot insert subscribers directly');

set local role service_role;
select lives_ok($$ select public.newsletter_subscribe('a0000000-0000-4000-8000-00000000000a', 'Fan@Example.com', 'ar') $$, 'Sign-up for an active store');
select lives_ok($$ select public.newsletter_subscribe('a0000000-0000-4000-8000-00000000000a', 'fan@example.com', 'en') $$, 'Repeated sign-up is idempotent');
select lives_ok($$ select public.newsletter_subscribe('b0000000-0000-4000-8000-00000000000b', 'b-fan@example.com', 'fr') $$, 'Sign-up for another store');
reset role;
select is((select count(*)::int from public.newsletter_subscribers where tenant_id = :tenant_a), 1, 'One row per email per store (case-insensitive)');

update public.tenants set status = 'suspended' where id = :tenant_b;
set local role service_role;
select throws_ok($$ select public.newsletter_subscribe('b0000000-0000-4000-8000-00000000000b', 'x@example.com', 'fr') $$, 'P0002', null, 'Suspended stores do not accept sign-ups');
reset role;

-- Reads are tenant-isolated and permission-gated.
select pg_temp.act_as('11111111-0000-4000-8000-0000000000c1');
set local role authenticated;
select results_eq($$ select email::text from public.newsletter_subscribers $$, array['fan@example.com'], 'Owner A sees only Tenant A subscribers');
reset role;

select pg_temp.act_as('11111111-0000-4000-8000-0000000000c2');
set local role authenticated;
select is((select count(*)::int from public.newsletter_subscribers), 0, 'Staff without marketing access see no subscribers');
reset role;

select * from finish();
rollback;
