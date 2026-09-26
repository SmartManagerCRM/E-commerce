-- =============================================================================
-- 0013 · Phase 7 — notifications (transactional email + daily brief)
--
--   tenants ─< notifications      (delivery log: what was sent, to whom, and how it went)
--   tenants ─< notification_daily_briefs   (idempotency: at most one brief per tenant per local day)
--
-- * Emails are sent from server code (Resend), never from the database —
--   Postgres has no business making outbound HTTP calls. This migration only
--   adds a settings shape (`tenant_settings.notifications`) and a delivery
--   log the app writes to with the service role after each send attempt.
-- * The database is still the source of truth for *whether* a notification
--   should fire (order/payment events already run through server actions;
--   the daily brief is idempotent per tenant per local calendar day via the
--   unique constraint below, not by trusting the caller not to double-fire).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tenant_settings.notifications = { order_emails: bool, daily_brief: bool, recipient_email: text|null }
-- -----------------------------------------------------------------------------
create or replace function app.validate_notification_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notifications ? 'order_emails' and jsonb_typeof(new.notifications -> 'order_emails') <> 'boolean' then
    raise exception 'notifications.order_emails must be a boolean' using errcode = '23514';
  end if;
  if new.notifications ? 'daily_brief' and jsonb_typeof(new.notifications -> 'daily_brief') <> 'boolean' then
    raise exception 'notifications.daily_brief must be a boolean' using errcode = '23514';
  end if;
  if new.notifications ? 'recipient_email' and jsonb_typeof(new.notifications -> 'recipient_email') not in ('string', 'null') then
    raise exception 'notifications.recipient_email is invalid' using errcode = '23514';
  end if;
  if new.notifications ? 'recipient_email' and jsonb_typeof(new.notifications -> 'recipient_email') = 'string'
     and (new.notifications ->> 'recipient_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'notifications.recipient_email is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tenant_settings_validate_notifications before insert or update of notifications on public.tenant_settings
  for each row execute function app.validate_notification_settings();

-- Normalised notification settings with safe defaults (on by default; the
-- owner can turn either kind off, and override who owner-facing mail goes to).
create or replace function public.notification_settings(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_emails', coalesce((s.notifications ->> 'order_emails')::boolean, true),
    'daily_brief', coalesce((s.notifications ->> 'daily_brief')::boolean, true),
    'recipient_email', coalesce(nullif(btrim(s.notifications ->> 'recipient_email'), ''), t.email)
  )
  from public.tenant_settings s
  join public.tenants t on t.id = s.tenant_id
  where s.tenant_id = p_tenant
$$;

revoke all on function public.notification_settings(uuid) from public, anon;
grant execute on function public.notification_settings(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Delivery log (written by the app after each send attempt; never by triggers)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  channel              text not null default 'email' check (channel in ('email')),
  template             text not null check (template in
                          ('order_placed', 'order_status_changed', 'payment_received',
                           'new_order_staff', 'staff_invited', 'owner_invited', 'daily_brief')),
  recipient_email      extensions.citext,
  recipient_customer_id uuid,
  recipient_user_id    uuid,
  subject              text not null check (length(subject) <= 300),
  payload              jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status               text not null check (status in ('sent', 'failed', 'skipped')),
  error                text check (error is null or length(error) <= 1000),
  provider_message_id  text,
  created_at           timestamptz not null default now(),
  foreign key (tenant_id, recipient_customer_id) references public.customers (tenant_id, id) on delete set null (recipient_customer_id)
);

create index notifications_tenant_created on public.notifications (tenant_id, created_at desc);

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (app.has_permission(tenant_id, 'settings.read') or app.is_super_admin());
-- No write policies: only the service role (server code, after calling Resend) inserts rows.

-- -----------------------------------------------------------------------------
-- Daily brief idempotency: at most one per tenant per local calendar day.
-- -----------------------------------------------------------------------------
create table public.notification_daily_briefs (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sent_on   date not null,
  sent_at   timestamptz not null default now(),
  primary key (tenant_id, sent_on)
);

alter table public.notification_daily_briefs enable row level security;
-- No policies or grants: only the service-role worker route touches this.

-- Yesterday's figures in the tenant's own time zone, for the daily brief email.
create or replace function public.daily_brief_summary(p_tenant uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
begin
  select date_trunc('day', (now() at time zone t.timezone) - interval '1 day') at time zone t.timezone,
         date_trunc('day', now() at time zone t.timezone) at time zone t.timezone
  into v_start, v_end
  from public.tenants t where t.id = p_tenant;

  return jsonb_build_object(
    'period_start', v_start, 'period_end', v_end,
    'orders', (select count(*) from public.orders o where o.tenant_id = p_tenant
                and o.placed_at >= v_start and o.placed_at < v_end and o.status <> 'cancelled'),
    'revenue_minor', (select coalesce(sum(o.total_minor), 0) from public.orders o where o.tenant_id = p_tenant
                       and o.placed_at >= v_start and o.placed_at < v_end and o.status <> 'cancelled'),
    'new_customers', (select count(*) from public.customers c where c.tenant_id = p_tenant
                        and c.first_order_at >= v_start and c.first_order_at < v_end),
    'open_orders', (select count(*) from public.orders o where o.tenant_id = p_tenant
                      and o.status in ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery')),
    'low_stock', (select count(*) from public.inventory_items i where i.tenant_id = p_tenant
                    and i.track_stock and (i.on_hand - i.reserved) <= i.min_stock)
  );
end;
$$;

revoke all on function public.daily_brief_summary(uuid) from public, anon, authenticated;
grant execute on function public.daily_brief_summary(uuid) to service_role;

-- Tenants due a daily brief right now: enabled, has a recipient, and not
-- already sent for today in their own time zone. The worker route calls this
-- and then, after actually sending, records the day in notification_daily_briefs.
create or replace function public.tenants_due_daily_brief()
returns table (tenant_id uuid, slug text, recipient_email text, business_name text, locale text, currency char(3), currency_exponent smallint, today date)
language sql stable security definer
set search_path = ''
as $$
  select s.id, s.slug, s.settings ->> 'recipient_email', s.business_name, s.default_language, s.currency, s.currency_exponent, s.today
  from (
    select t.id, t.slug, t.business_name, t.default_language, t.currency, c.exponent as currency_exponent,
           (now() at time zone t.timezone)::date as today, public.notification_settings(t.id) as settings
    from public.tenants t
    join public.currencies c on c.code = t.currency
    where t.status = 'active'
  ) s
  where (s.settings ->> 'daily_brief')::boolean and (s.settings ->> 'recipient_email') is not null
    and not exists (
      select 1 from public.notification_daily_briefs b where b.tenant_id = s.id and b.sent_on = s.today
    )
$$;

revoke all on function public.tenants_due_daily_brief() from public, anon, authenticated;
grant execute on function public.tenants_due_daily_brief() to service_role;
