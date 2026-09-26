-- =============================================================================
-- 0015 · Phase 8 — booking (tables, appointments)
--
--   branches ─< booking_resources ─< bookings
--   tenants  ─< booking_blackouts
--
-- * A "resource" is whatever gets booked: a table/area for a café or
--   restaurant, or a staff member/room for a salon or spa (`kind`).
-- * Double-booking is impossible at the database level: an exclusion
--   constraint on (resource_id, period) rejects an overlapping pending or
--   confirmed booking outright — the same guarantee `btree_gist` gives the
--   architecture doc's own design (§7.4), not just an application check.
-- * Guest booking mirrors the guest-checkout pattern from Phase 5: the
--   browser holds a random access token in the URL; only its hash is ever
--   stored, and every storefront read/write goes through service-role-only
--   functions with the tenant resolved from the request Host header.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- Booking gets its own three notification templates alongside Phase 7's order/payment ones.
alter table public.notifications drop constraint notifications_template_check;
alter table public.notifications add constraint notifications_template_check check (template in
  ('order_placed', 'order_status_changed', 'payment_received', 'new_order_staff', 'staff_invited', 'owner_invited',
   'daily_brief', 'booking_requested', 'booking_status_changed', 'new_booking_staff'));

-- -----------------------------------------------------------------------------
-- tenant_settings.booking = { accepting_bookings, default_duration_minutes,
--   buffer_minutes, min_notice_minutes, max_advance_days, max_party_size }
-- -----------------------------------------------------------------------------
create or replace function app.validate_booking_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if new.booking ? 'accepting_bookings' and jsonb_typeof(new.booking -> 'accepting_bookings') <> 'boolean' then
    raise exception 'booking.accepting_bookings must be a boolean' using errcode = '23514';
  end if;
  foreach k in array array['default_duration_minutes', 'buffer_minutes', 'min_notice_minutes', 'max_advance_days', 'max_party_size'] loop
    if new.booking ? k and jsonb_typeof(new.booking -> k) <> 'null' and (
         jsonb_typeof(new.booking -> k) <> 'number'
         or (new.booking ->> k)::numeric <> trunc((new.booking ->> k)::numeric)
         or (new.booking ->> k)::numeric < 0) then
      raise exception 'booking.% is invalid', k using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger tenant_settings_validate_booking before insert or update of booking on public.tenant_settings
  for each row execute function app.validate_booking_settings();

create or replace function public.booking_settings(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accepting_bookings', coalesce((s.booking ->> 'accepting_bookings')::boolean, false) and app.tenant_has_feature(p_tenant, 'booking'),
    'default_duration_minutes', coalesce((s.booking ->> 'default_duration_minutes')::integer, 60),
    'buffer_minutes', coalesce((s.booking ->> 'buffer_minutes')::integer, 0),
    'min_notice_minutes', coalesce((s.booking ->> 'min_notice_minutes')::integer, 30),
    'max_advance_days', coalesce((s.booking ->> 'max_advance_days')::integer, 30),
    'max_party_size', (s.booking ->> 'max_party_size')::integer
  )
  from public.tenant_settings s
  where s.tenant_id = p_tenant
$$;

revoke all on function public.booking_settings(uuid) from public;
grant execute on function public.booking_settings(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Resources: what gets booked (a table/area, or a staff member/room)
-- -----------------------------------------------------------------------------
create table public.booking_resources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  branch_id     uuid not null,
  name          jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  kind          text not null check (kind in ('table', 'area', 'staff', 'room')),
  capacity_min  integer check (capacity_min is null or capacity_min >= 1),
  capacity_max  integer check (capacity_max is null or capacity_max >= 1),
  active        boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade,
  check (capacity_min is null or capacity_max is null or capacity_min <= capacity_max)
);

create index booking_resources_tenant_branch on public.booking_resources (tenant_id, branch_id, position);
create trigger booking_resources_updated_at before update on public.booking_resources
  for each row execute function app.set_updated_at();

alter table public.booking_resources enable row level security;
grant select, insert, update, delete on public.booking_resources to authenticated;
create policy booking_resources_read on public.booking_resources for select to authenticated
  using (app.has_permission(tenant_id, 'bookings.read') or app.is_super_admin());
create policy booking_resources_insert on public.booking_resources for insert to authenticated
  with check (app.has_permission(tenant_id, 'bookings.write'));
create policy booking_resources_update on public.booking_resources for update to authenticated
  using (app.has_permission(tenant_id, 'bookings.write')) with check (app.has_permission(tenant_id, 'bookings.write'));
create policy booking_resources_delete on public.booking_resources for delete to authenticated
  using (app.has_permission(tenant_id, 'bookings.write'));
create trigger audit_booking_resources after insert or update or delete on public.booking_resources
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Blackouts: a resource (or a whole branch, when resource_id is null) is
-- unavailable for a period (holidays, maintenance, a private event).
-- -----------------------------------------------------------------------------
create table public.booking_blackouts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  branch_id   uuid not null,
  resource_id uuid,
  period      tstzrange not null check (not isempty(period) and lower_inf(period) = false and upper_inf(period) = false),
  reason      text check (reason is null or length(reason) <= 200),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade,
  foreign key (tenant_id, resource_id) references public.booking_resources (tenant_id, id) on delete cascade
);

create index booking_blackouts_tenant_branch on public.booking_blackouts (tenant_id, branch_id);
create index booking_blackouts_resource on public.booking_blackouts (resource_id) where resource_id is not null;

alter table public.booking_blackouts enable row level security;
grant select, insert, delete on public.booking_blackouts to authenticated;
create policy booking_blackouts_read on public.booking_blackouts for select to authenticated
  using (app.has_permission(tenant_id, 'bookings.read') or app.is_super_admin());
create policy booking_blackouts_insert on public.booking_blackouts for insert to authenticated
  with check (app.has_permission(tenant_id, 'bookings.write'));
create policy booking_blackouts_delete on public.booking_blackouts for delete to authenticated
  using (app.has_permission(tenant_id, 'bookings.write'));

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  branch_id         uuid not null,
  resource_id       uuid not null,
  customer_id       uuid,
  period            tstzrange not null check (not isempty(period) and lower_inf(period) = false and upper_inf(period) = false),
  guests            integer not null check (guests between 1 and 100),
  status            text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show')),
  contact           jsonb not null check (jsonb_typeof(contact) = 'object'),
  notes             text check (notes is null or length(notes) <= 500),
  source            text not null default 'storefront' check (source in ('storefront', 'staff')),
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  responded_at      timestamptz,
  responded_by      uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade,
  foreign key (tenant_id, resource_id) references public.booking_resources (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id),
  -- No two pending/confirmed bookings on the same resource may overlap.
  exclude using gist (resource_id with =, period with &&) where (status in ('pending', 'confirmed'))
);

create index bookings_tenant_period on public.bookings (tenant_id, branch_id, lower(period));
create index bookings_tenant_status on public.bookings (tenant_id, status, lower(period));
create index bookings_customer on public.bookings (tenant_id, customer_id, lower(period));
create trigger bookings_updated_at before update on public.bookings for each row execute function app.set_updated_at();

alter table public.bookings enable row level security;
grant select on public.bookings to authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (app.has_permission(tenant_id, 'bookings.read') or app.is_super_admin());
-- No direct writes: guests have no session to write with, and every staff
-- change must go through update_booking_status() (transition-checked).
create trigger audit_bookings after update on public.bookings for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Storefront reads (service_role only; safe fields, no qr/internal ids)
-- -----------------------------------------------------------------------------
create or replace function public.storefront_booking_options(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accepting_bookings', (s ->> 'accepting_bookings')::boolean,
    'default_duration_minutes', (s ->> 'default_duration_minutes')::integer,
    'min_notice_minutes', (s ->> 'min_notice_minutes')::integer,
    'max_advance_days', (s ->> 'max_advance_days')::integer,
    'max_party_size', s -> 'max_party_size',
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'branch_id', r.branch_id, 'name', r.name, 'kind', r.kind,
               'capacity_min', r.capacity_min, 'capacity_max', r.capacity_max) order by r.position)
      from public.booking_resources r where r.tenant_id = p_tenant and r.active), '[]'::jsonb)
  )
  from (select public.booking_settings(p_tenant) as s) x
  join public.tenants t on t.id = p_tenant and t.status = 'active'
$$;

revoke all on function public.storefront_booking_options(uuid) from public, anon, authenticated;
grant execute on function public.storefront_booking_options(uuid) to service_role;

-- Available start times for a resource on one calendar day (tenant time
-- zone), at `default_duration_minutes` granularity, honouring opening
-- hours, existing bookings, blackouts and the minimum-notice window.
create or replace function public.storefront_booking_availability(p_tenant uuid, p_resource uuid, p_date date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_tz        text;
  v_hours     jsonb;
  v_day       text;
  v_duration  integer;
  v_notice    interval;
  v_max_days  integer;
  v_branch    uuid;
  v_slots     jsonb := '[]'::jsonb;
  v_interval  jsonb;
  v_open      time;
  v_close     time;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_day_end   timestamptz;
begin
  select t.timezone, b.opening_hours, r.branch_id
  into v_tz, v_hours, v_branch
  from public.booking_resources r
  join public.branches b on b.id = r.branch_id
  join public.tenants t on t.id = r.tenant_id
  where r.tenant_id = p_tenant and r.id = p_resource and r.active;
  if v_branch is null then
    return '[]'::jsonb;
  end if;

  select (public.booking_settings(p_tenant) ->> 'default_duration_minutes')::integer,
         (public.booking_settings(p_tenant) ->> 'min_notice_minutes') || ' minutes',
         (public.booking_settings(p_tenant) ->> 'max_advance_days')::integer
  into v_duration, v_notice, v_max_days;

  if p_date < (now() at time zone v_tz)::date or p_date > (now() at time zone v_tz)::date + (coalesce(v_max_days, 30) || ' days')::interval then
    return '[]'::jsonb;
  end if;

  v_day := to_char(p_date, 'dy');

  for v_interval in select * from jsonb_array_elements(coalesce(v_hours -> v_day, '[]'::jsonb))
  loop
    v_open := (v_interval ->> 'open')::time;
    v_close := (v_interval ->> 'close')::time;
    v_cursor := (p_date::timestamp + v_open) at time zone v_tz;
    v_day_end := (p_date::timestamp + v_close) at time zone v_tz;
    while v_cursor + (v_duration || ' minutes')::interval <= v_day_end loop
      v_end := v_cursor + (v_duration || ' minutes')::interval;
      if v_cursor >= now() + v_notice
         and not exists (
           select 1 from public.bookings bk
           where bk.tenant_id = p_tenant and bk.resource_id = p_resource
             and bk.status in ('pending', 'confirmed') and bk.period && tstzrange(v_cursor, v_end, '[)')
         )
         and not exists (
           select 1 from public.booking_blackouts bo
           where bo.tenant_id = p_tenant and (bo.resource_id = p_resource or bo.resource_id is null)
             and bo.branch_id = v_branch and bo.period && tstzrange(v_cursor, v_end, '[)')
         ) then
        v_slots := v_slots || jsonb_build_array(jsonb_build_object('start', v_cursor, 'end', v_end));
      end if;
      v_cursor := v_cursor + (v_duration || ' minutes')::interval;
    end loop;
  end loop;

  return v_slots;
end;
$$;

revoke all on function public.storefront_booking_availability(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.storefront_booking_availability(uuid, uuid, date) to service_role;

-- Places a booking request. Always `pending` — a member of staff confirms it.
--   p_contact = { name, email, phone? }
create or replace function public.create_booking(
  p_tenant uuid, p_resource uuid, p_start timestamptz, p_end timestamptz,
  p_guests integer, p_contact jsonb, p_notes text, p_access_token_hash text
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  settings   jsonb := public.booking_settings(p_tenant);
  r          public.booking_resources%rowtype;
  v_customer uuid;
  v_booking  uuid;
  v_contact  jsonb;
begin
  if not coalesce((settings ->> 'accepting_bookings')::boolean, false) then
    raise exception 'bookings_closed' using errcode = '22023';
  end if;
  select * into r from public.booking_resources where tenant_id = p_tenant and id = p_resource and active;
  if r.id is null then
    raise exception 'invalid_resource' using errcode = '22023';
  end if;
  if p_end <= p_start or p_start < now() + ((settings ->> 'min_notice_minutes') || ' minutes')::interval then
    raise exception 'invalid_time' using errcode = '22023';
  end if;
  if (settings ->> 'max_advance_days') is not null and p_start > now() + ((settings ->> 'max_advance_days') || ' days')::interval then
    raise exception 'too_far_ahead' using errcode = '22023';
  end if;
  if p_guests < 1 or (r.capacity_max is not null and p_guests > r.capacity_max) then
    raise exception 'party_too_large' using errcode = '22023';
  end if;
  if (settings ->> 'max_party_size') is not null and p_guests > (settings ->> 'max_party_size')::integer then
    raise exception 'party_too_large' using errcode = '22023';
  end if;
  if exists (select 1 from public.booking_blackouts bo where bo.tenant_id = p_tenant
             and (bo.resource_id = p_resource or bo.resource_id is null) and bo.branch_id = r.branch_id
             and bo.period && tstzrange(p_start, p_end, '[)')) then
    raise exception 'slot_taken' using errcode = '22023';
  end if;

  v_contact := jsonb_build_object(
    'name', btrim(p_contact ->> 'name'), 'email', lower(btrim(p_contact ->> 'email')),
    'phone', nullif(btrim(p_contact ->> 'phone'), ''));
  if coalesce(length(v_contact ->> 'name'), 0) not between 1 and 120
     or (v_contact ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_contact ->> 'email') > 254
     or ((v_contact ->> 'phone') is not null and (v_contact ->> 'phone') !~ '^\+?[0-9 ()-]{6,24}$') then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 500 or coalesce(p_access_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_booking' using errcode = '22023';
  end if;

  insert into public.customers as c (tenant_id, email, phone, full_name, marketing_consent)
  values (p_tenant, v_contact ->> 'email', v_contact ->> 'phone', v_contact ->> 'name', false)
  on conflict (tenant_id, email) do update set
    full_name = excluded.full_name, phone = coalesce(excluded.phone, c.phone)
  returning id into v_customer;

  begin
    insert into public.bookings (tenant_id, branch_id, resource_id, customer_id, period, guests, contact, notes,
                                 access_token_hash)
    values (p_tenant, r.branch_id, p_resource, v_customer, tstzrange(p_start, p_end, '[)'), p_guests, v_contact,
            nullif(btrim(p_notes), ''), p_access_token_hash)
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = '22023';
  end;

  return jsonb_build_object('booking_id', v_booking);
end;
$$;

revoke all on function public.create_booking(uuid, uuid, timestamptz, timestamptz, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, timestamptz, integer, jsonb, text, text) to service_role;

-- Customer-facing booking status (private link, same pattern as storefront_order).
create or replace function public.storefront_booking(p_tenant uuid, p_id uuid, p_token_hash text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'starts_at', lower(b.period), 'ends_at', upper(b.period),
    'guests', b.guests, 'notes', b.notes, 'contact', b.contact,
    'resource_name', r.name, 'resource_kind', r.kind, 'created_at', b.created_at
  )
  from public.bookings b
  join public.booking_resources r on r.id = b.resource_id
  where b.tenant_id = p_tenant and b.id = p_id and b.access_token_hash = p_token_hash
$$;

revoke all on function public.storefront_booking(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.storefront_booking(uuid, uuid, text) to service_role;

-- Lets the guest cancel their own still-open booking via their private link.
create or replace function public.cancel_booking_by_customer(p_tenant uuid, p_id uuid, p_token_hash text)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where tenant_id = p_tenant and id = p_id and access_token_hash = p_token_hash for update;
  if not found or b.status not in ('pending', 'confirmed') then
    return false;
  end if;
  update public.bookings set status = 'cancelled', responded_at = now() where id = b.id;
  return true;
end;
$$;

revoke all on function public.cancel_booking_by_customer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_booking_by_customer(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Staff workflow
-- -----------------------------------------------------------------------------
create or replace function app.allowed_next_booking_statuses(p_status text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select case p_status
    when 'pending' then array['confirmed', 'rejected', 'cancelled']
    when 'confirmed' then array['completed', 'no_show', 'cancelled']
    else array[]::text[]
  end
$$;

create or replace function public.update_booking_status(p_booking uuid, p_status text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not app.has_permission(b.tenant_id, 'bookings.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not (p_status = any (app.allowed_next_booking_statuses(b.status))) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;

  update public.bookings set status = p_status, responded_at = now(), responded_by = (select auth.uid())
  where id = b.id;
  return p_status;
end;
$$;

revoke all on function public.update_booking_status(uuid, text) from public, anon;
grant execute on function public.update_booking_status(uuid, text) to authenticated;
