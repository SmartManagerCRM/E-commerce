-- Phase 8: booking resources, availability, guest booking requests, staff
-- workflow, and the double-booking guarantee (a GiST exclusion constraint,
-- not just an application check).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

create function pg_temp.act_as(uid uuid, role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then json_build_object('role', role)::text
         else json_build_object('sub', uid, 'role', role)::text end, true);
end $$;

\set A '''a0000000-0000-4000-8000-00000000000a'''
\set B '''b0000000-0000-4000-8000-00000000000b'''
\set K1 '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set K2 '''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:A, :B);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
insert into auth.users (id, email) values
  ('66666666-0000-4000-8000-0000000000e1', 'p8-owner-a@test.local'),
  ('66666666-0000-4000-8000-0000000000e2', 'p8-staff-a@test.local'),
  ('66666666-0000-4000-8000-0000000000e3', 'p8-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '66666666-0000-4000-8000-0000000000e1', 'tenant_owner'),
  (:A, '66666666-0000-4000-8000-0000000000e2', 'staff'),
  (:B, '66666666-0000-4000-8000-0000000000e3', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;
update public.tenants set status = 'active', timezone = 'Asia/Riyadh' where id in (:A, :B);
update public.tenant_settings set booking =
  '{"accepting_bookings": true, "default_duration_minutes": 60, "buffer_minutes": 0, "min_notice_minutes": 30, "max_advance_days": 60}'
  where tenant_id = :A;
-- Open every day of the week, 09:00-17:00, so the test isn't sensitive to which weekday it runs on.
update public.branches set opening_hours =
  jsonb_build_object('mon', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'tue', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'wed', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'thu', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'fri', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'sat', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')),
                      'sun', jsonb_build_array(jsonb_build_object('open','09:00','close','17:00')))
  where tenant_id in (:A, :B) and is_default;

create function pg_temp.test_date() returns date language sql as
  $$ select ((now() at time zone 'Asia/Riyadh')::date + 5) $$;

-- ---------------------------------------------------------------------------
-- Resources: permission-checked, tenant-scoped
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select * from public.booking_resources $$, '42501', null, 'anon cannot read booking resources');
select throws_ok($$ insert into public.booking_resources (tenant_id, branch_id, name, kind) values
  ('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default), '{"en":"x"}', 'table') $$,
  '42501', null, 'anon cannot create a booking resource');
reset role;

select pg_temp.act_as('66666666-0000-4000-8000-0000000000e2');
set local role authenticated;
select lives_ok($$ insert into public.booking_resources (tenant_id, branch_id, name, kind, capacity_min, capacity_max) values
  ('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default), '{"en":"Table 1"}', 'table', 2, 4) $$,
  'Staff (bookings.write) creates a table resource');
reset role;

select pg_temp.act_as('66666666-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.booking_resources where tenant_id = :A), 0, 'Owner B cannot see Store A''s resources');
reset role;

-- ---------------------------------------------------------------------------
-- Availability: a full day of hourly slots, honouring party size
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(jsonb_array_length(public.storefront_booking_availability(:A,
  (select id from public.booking_resources where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and name ->> 'en' = 'Table 1'),
  pg_temp.test_date())), 8, 'Nine-to-five, one-hour slots: 09,10,...,16 = 8 slots');

select is(public.storefront_booking_options(:A) ->> 'accepting_bookings', 'true', 'Storefront sees booking as open');
reset role;

-- ---------------------------------------------------------------------------
-- Placing a booking request: always pending; the slot then disappears
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select throws_ok($$ select public.create_booking('a0000000-0000-4000-8000-00000000000a',
  (select id from public.booking_resources where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and name ->> 'en' = 'Table 1'),
  (pg_temp.test_date() + time '10:00') at time zone 'Asia/Riyadh', (pg_temp.test_date() + time '11:00') at time zone 'Asia/Riyadh',
  6, '{"name":"Sara","email":"sara@example.com"}', null, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $$,
  '22023', 'party_too_large', 'A party larger than the table''s capacity is rejected');

select is(public.create_booking(:A,
  (select id from public.booking_resources where tenant_id = :A and name ->> 'en' = 'Table 1'),
  (pg_temp.test_date() + time '10:00') at time zone 'Asia/Riyadh', (pg_temp.test_date() + time '11:00') at time zone 'Asia/Riyadh',
  3, '{"name":"Sara","email":"sara@example.com","phone":"+966500000000"}', 'Window seat please', :K1) ? 'booking_id',
  true, 'A valid booking request is created');
select is((select status from public.bookings where tenant_id = :A), 'pending', 'It starts pending');
select is((select email::text from public.customers where tenant_id = :A), 'sara@example.com', 'A customer record is created from the booking contact');

select is(jsonb_array_length(public.storefront_booking_availability(:A,
  (select id from public.booking_resources where tenant_id = :A and name ->> 'en' = 'Table 1'), pg_temp.test_date())), 7,
  'The booked hour no longer shows as available (7 of 8 slots remain)');

select throws_ok($$ select public.create_booking('a0000000-0000-4000-8000-00000000000a',
  (select id from public.booking_resources where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and name ->> 'en' = 'Table 1'),
  (pg_temp.test_date() + time '10:30') at time zone 'Asia/Riyadh', (pg_temp.test_date() + time '11:30') at time zone 'Asia/Riyadh',
  2, '{"name":"Omar","email":"omar@example.com"}', null, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') $$,
  '22023', 'slot_taken', 'An overlapping request on the same table is rejected outright (the exclusion constraint, not just the availability check)');
reset role;

-- ---------------------------------------------------------------------------
-- Customer tracking and self-cancel
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(public.storefront_booking(:A, (select id from public.bookings where tenant_id = :A), :K1) ->> 'status', 'pending',
  'The customer can see their own booking with the right token');
select is(public.storefront_booking(:A, (select id from public.bookings where tenant_id = :A), repeat('0', 64)), null,
  'A wrong token reveals nothing');
select is(public.cancel_booking_by_customer(:A, (select id from public.bookings where tenant_id = :A), :K1), true,
  'The guest cancels their own booking');
select is((select status from public.bookings where tenant_id = :A), 'cancelled', 'It is now cancelled');
select is(public.cancel_booking_by_customer(:A, (select id from public.bookings where tenant_id = :A), :K1), false,
  'Cancelling an already-cancelled booking is a no-op, not an error');
select is(jsonb_array_length(public.storefront_booking_availability(:A,
  (select id from public.booking_resources where tenant_id = :A and name ->> 'en' = 'Table 1'), pg_temp.test_date())), 8,
  'Cancelling releases the slot (back to 8 of 8)');
reset role;

-- ---------------------------------------------------------------------------
-- Staff workflow: confirm / reject / complete, transition-checked
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'service_role');
set local role service_role;
select public.create_booking(:A,
  (select id from public.booking_resources where tenant_id = :A and name ->> 'en' = 'Table 1'),
  (pg_temp.test_date() + time '13:00') at time zone 'Asia/Riyadh', (pg_temp.test_date() + time '14:00') at time zone 'Asia/Riyadh',
  2, '{"name":"Lina","email":"lina@example.com"}', null, :K2);
reset role;

select pg_temp.act_as('66666666-0000-4000-8000-0000000000e3');
set local role authenticated;
select is((select count(*)::int from public.bookings where tenant_id = :A), 0, 'Owner B cannot see Store A''s bookings');
select throws_ok($$ select public.update_booking_status((select id from public.bookings where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'pending'), 'confirmed') $$,
  'P0002', null, 'Owner B cannot find (or change) A''s booking');
reset role;

select pg_temp.act_as('66666666-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ update public.bookings set status = 'confirmed' where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'pending' $$,
  '42501', null, 'Bookings cannot be edited directly, only through update_booking_status');
select is(public.update_booking_status((select id from public.bookings where tenant_id = :A and status = 'pending'), 'confirmed'), 'confirmed',
  'Owner confirms the booking');
select throws_ok($$ select public.update_booking_status((select id from public.bookings where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and status = 'confirmed'), 'pending') $$,
  '22023', 'invalid_transition', 'A confirmed booking cannot go back to pending');
select is(public.update_booking_status((select id from public.bookings where tenant_id = :A and status = 'confirmed'), 'completed'), 'completed',
  'Owner marks it completed once the guests have been seated');
select is((select responded_by from public.bookings where tenant_id = :A and status = 'completed'), '66666666-0000-4000-8000-0000000000e1',
  'The response is attributed to the staff member who made it');
reset role;

-- ---------------------------------------------------------------------------
-- Blackouts remove availability without an actual booking
-- ---------------------------------------------------------------------------
select pg_temp.act_as('66666666-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ insert into public.booking_blackouts (tenant_id, branch_id, resource_id, period, reason) values
  ('b0000000-0000-4000-8000-00000000000b', (select id from public.branches where tenant_id = 'b0000000-0000-4000-8000-00000000000b' and is_default), null,
   tstzrange(now(), now() + interval '1 hour'), 'private event') $$,
  '42501', null, 'Owner A cannot create a blackout on Store B''s branch');
select lives_ok($$ insert into public.booking_blackouts (tenant_id, branch_id, resource_id, period, reason) values
  ('a0000000-0000-4000-8000-00000000000a', (select id from public.branches where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and is_default),
   (select id from public.booking_resources where tenant_id = 'a0000000-0000-4000-8000-00000000000a' and name ->> 'en' = 'Table 1'),
   tstzrange((pg_temp.test_date() + time '15:00') at time zone 'Asia/Riyadh', (pg_temp.test_date() + time '16:00') at time zone 'Asia/Riyadh'), 'Deep clean') $$,
  'Owner blocks out an hour for a deep clean');
reset role;

select pg_temp.act_as(null, 'service_role');
set local role service_role;
select is(jsonb_array_length(public.storefront_booking_availability(:A,
  (select id from public.booking_resources where tenant_id = :A and name ->> 'en' = 'Table 1'), pg_temp.test_date())), 7,
  'The blacked-out hour is unavailable even though nothing is actually booked there');
reset role;

select * from finish();
rollback;
