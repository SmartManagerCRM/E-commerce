-- Phase 7: notification settings, the delivery log's RLS, and the daily
-- brief's idempotency and figures. Actually sending email is server code
-- (Resend), not tested here — this is the database side only: settings
-- validation, who is due a brief, and that nobody but staff (or nobody at
-- all, for writes) can touch the log.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

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
  ('44444444-0000-4000-8000-0000000000e1', 'p7-owner-a@test.local'),
  ('44444444-0000-4000-8000-0000000000e2', 'p7-staff-a@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '44444444-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '44444444-0000-4000-8000-0000000000e2', 'staff')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active', email = 'owner@roasters.example', timezone = 'Asia/Riyadh' where id = :A;
update public.tenants set status = 'active', email = 'owner@coffeehouse.example' where id = :B;
update public.tenant_settings set notifications = '{}'::jsonb where tenant_id in (:A, :B);
delete from public.notification_daily_briefs where tenant_id in (:A, :B);
delete from public.notifications where tenant_id in (:A, :B);

-- ---------------------------------------------------------------------------
-- Settings: safe defaults, validated shape
-- ---------------------------------------------------------------------------
select is(public.notification_settings(:A) -> 'order_emails', 'true'::jsonb, 'Order emails default on');
select is(public.notification_settings(:A) -> 'daily_brief', 'true'::jsonb, 'Daily brief defaults on');
select is(public.notification_settings(:A) ->> 'recipient_email', 'owner@roasters.example',
  'Recipient defaults to the tenant''s own email');

select throws_ok($$ update public.tenant_settings set notifications = '{"order_emails": "yes"}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'order_emails must be a boolean');
select throws_ok($$ update public.tenant_settings set notifications = '{"recipient_email": "not-an-email"}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'recipient_email must look like an email');
select lives_ok($$ update public.tenant_settings set notifications = '{"daily_brief": false, "recipient_email": "manager@roasters.example"}' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  'A valid override is accepted');
select is(public.notification_settings(:A) ->> 'recipient_email', 'manager@roasters.example', 'The override is used instead of the tenant email');
select is(public.notification_settings(:A) -> 'daily_brief', 'false'::jsonb, 'Daily brief can be turned off');

-- ---------------------------------------------------------------------------
-- Delivery log: staff can read with settings.read; nobody can write directly
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select * from public.notifications $$, '42501', null, 'anon cannot read the notification log');
reset role;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
insert into public.notifications (tenant_id, template, recipient_email, subject, status)
values (:A, 'order_placed', 'customer@example.com', 'Your order', 'sent');
reset role;

select pg_temp.act_as('44444444-0000-4000-8000-0000000000e1');
set local role authenticated;
select is((select count(*)::int from public.notifications where tenant_id = :A), 1, 'Owner A sees the log entry (settings.read)');
select throws_ok($$ insert into public.notifications (tenant_id, template, subject, status) values ('a0000000-0000-4000-8000-00000000000a', 'order_placed', 'x', 'sent') $$,
  '42501', null, 'Staff cannot write the notification log directly — only the service role does, after sending');
reset role;

select pg_temp.act_as('44444444-0000-4000-8000-0000000000e2');
set local role authenticated;
select is((select count(*)::int from public.notifications where tenant_id = :B), 0, 'Owner B''s tenant has nothing, and staff A cannot see it anyway');
reset role;

-- ---------------------------------------------------------------------------
-- Daily brief: idempotent per tenant per local day, and honest about who's due
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
-- B is enabled with a recipient (its own tenant email) and hasn't been sent today: due.
select is((select count(*)::int from public.tenants_due_daily_brief() where tenant_id = :B), 1, 'Store B is due its daily brief');
-- A turned the brief off above: not due even though it has a recipient.
select is((select count(*)::int from public.tenants_due_daily_brief() where tenant_id = :A), 0, 'Store A opted out and is not due');

insert into public.notification_daily_briefs (tenant_id, sent_on) values (:B, (now() at time zone 'UTC')::date);
select is((select count(*)::int from public.tenants_due_daily_brief() where tenant_id = :B), 0,
  'Once recorded as sent for today, Store B is no longer due (whatever its own time zone says "today" is)');

update public.tenant_settings set notifications = jsonb_set(notifications, '{recipient_email}', 'null') where tenant_id = :B;
select is((select count(*)::int from public.tenants_due_daily_brief() where tenant_id = :B), 0,
  'With no recipient email at all, Store B is not due either');
reset role;

-- ---------------------------------------------------------------------------
-- daily_brief_summary: real figures for "yesterday" in the tenant's own time zone
-- ---------------------------------------------------------------------------
select pg_temp.act_as('44444444-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select public.daily_brief_summary('a0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Only the service role computes the brief (it is sent by the app, not read by staff)');
reset role;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is((public.daily_brief_summary(:A) ->> 'orders')::int, 0, 'No orders placed yesterday for a fresh tenant');
reset role;

select * from finish();
rollback;
