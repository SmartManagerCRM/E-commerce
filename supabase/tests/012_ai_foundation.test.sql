-- AI Operating System Phase 1: entitlements, tenant AI settings, usage
-- metering, and RLS/tenant-isolation on the conversation/message/tool-call
-- tables later phases will write to.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(23);

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
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'p-ai-owner-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'p-ai-staff-a@test.local'),
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'p-ai-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, 'aaaaaaaa-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, 'aaaaaaaa-0000-4000-8000-0000000000e2', 'staff'),
  (:B, 'aaaaaaaa-0000-4000-8000-0000000000e3', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active' where id in (:A, :B);

-- ---------------------------------------------------------------------------
-- Settings: safe defaults, feature-gated on the ai_assistant master feature
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(public.ai_settings(:A) ->> 'active', 'false', 'AI is off by default even on a plan that has the feature');
select is(public.ai_settings(:A) ->> 'assistant_name', 'Assistant', 'Assistant name defaults to "Assistant"');
update public.tenant_settings set ai = '{"active": true, "assistant_name": "Riya", "tone": "friendly"}' where tenant_id = :A;
select is(public.ai_settings(:A) ->> 'active', 'true', 'Turning the tenant toggle on (plan already has ai_assistant) activates it');
select is(public.ai_settings(:A) ->> 'assistant_name', 'Riya', 'Assistant name is read back');
select is(public.ai_settings(:A) ->> 'ordering_enabled', 'true', 'Professional plan includes ai_ordering');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ update public.tenant_settings set ai = '{"tone": "sarcastic"}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'An unsupported tone value is rejected');
select throws_ok($$ update public.tenant_settings set ai = '{"active": "yes"}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'ai.active must be a boolean');
reset role;

-- ---------------------------------------------------------------------------
-- Conversations/messages/tool calls: RLS-read-only, tenant-scoped
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
insert into public.ai_conversations (id, tenant_id, channel, feature_key, locale) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :A, 'storefront', 'ai_ordering', 'en');
insert into public.ai_messages (conversation_id, tenant_id, role, content) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :A, 'user', 'I want two cappuccinos.');
insert into public.ai_tool_calls (conversation_id, tenant_id, tool_name, arguments, result) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :A, 'search_products', '{"query":"cappuccino"}', '{"count":1}');
reset role;

select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select * from public.ai_conversations $$, '42501', null, 'anon cannot read AI conversations');
select throws_ok($$ select * from public.ai_messages $$, '42501', null, 'anon cannot read AI messages');
select throws_ok($$ select * from public.ai_tool_calls $$, '42501', null, 'anon cannot read AI tool calls');
select throws_ok($$ select * from public.ai_usage $$, '42501', null, 'anon cannot read AI usage');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
set local role authenticated;
select is((select count(*)::int from public.ai_conversations where tenant_id = :A), 1, 'Owner (ai.use) can read the tenant''s own AI conversations');
select is((select count(*)::int from public.ai_messages where tenant_id = :A), 1, 'Owner can read the tenant''s own AI messages');
select is((select count(*)::int from public.ai_tool_calls where tenant_id = :A), 1, 'Owner can read the tenant''s own AI tool calls');
select throws_ok($$ insert into public.ai_conversations (tenant_id, channel, feature_key) values
  ('a0000000-0000-4000-8000-00000000000a', 'storefront', 'ai_ordering') $$,
  '42501', null, 'No direct writes to ai_conversations even for the owner — only a service-role function may create one');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e2');
set local role authenticated;
select is((select count(*)::int from public.ai_conversations where tenant_id = :A), 0,
  'Plain staff (no ai.use permission) sees no AI conversations, even the tenant''s own');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.ai_conversations where tenant_id = :A), 0, 'Owner B cannot see Store A''s AI conversations');
select is((select count(*)::int from public.ai_messages where tenant_id = :A), 0, 'Owner B cannot see Store A''s AI messages');
reset role;

-- ---------------------------------------------------------------------------
-- Usage metering: accumulates per tenant per month, read-only to staff
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select lives_ok($$ select public.record_ai_usage('a0000000-0000-4000-8000-00000000000a', 120, 340) $$, 'First usage record for the month');
select lives_ok($$ select public.record_ai_usage('a0000000-0000-4000-8000-00000000000a', 80, 200) $$, 'Second call accumulates onto the same month');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
set local role authenticated;
select is(public.ai_usage_summary(:A) ->> 'requests', '2', 'Two recorded model calls this month');
select is(public.ai_usage_summary(:A) ->> 'input_tokens', '200', 'Input tokens accumulate (120 + 80)');
select is(public.ai_usage_summary(:A) ->> 'monthly_credit_limit', '2000', 'The professional plan''s included AI credit limit is visible');
reset role;

select * from finish();
rollback;
