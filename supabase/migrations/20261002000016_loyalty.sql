-- =============================================================================
-- 0016 · Phase 9 — loyalty (points, tiers, staff-redeemed rewards)
--
--   tenant_settings.loyalty ─< loyalty_tiers / loyalty_rewards
--   customers ─< loyalty_ledger >─ orders
--
-- * The "program" itself is config, not an entity with its own list — it
--   lives in tenant_settings.loyalty, the same validated-JSON-column
--   pattern already used for checkout/tax/notifications/booking, rather
--   than a separate one-row-per-tenant table.
-- * loyalty_ledger is append-only and the single source of truth for a
--   customer's balance: no `points` column anywhere is ever written to
--   directly, so the balance is always exactly the sum of its history.
-- * Points are earned automatically, in the same two places an order can
--   become paid (`record_order_payment`, `confirm_online_payment`) — never
--   from the browser, and idempotently (one `earned_order` row per order).
-- =============================================================================

alter table public.tenant_settings
  add column loyalty jsonb not null default '{}'::jsonb check (jsonb_typeof(loyalty) = 'object');

-- -----------------------------------------------------------------------------
-- tenant_settings.loyalty = { active, points_per_currency_unit }
-- -----------------------------------------------------------------------------
create or replace function app.validate_loyalty_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.loyalty ? 'active' and jsonb_typeof(new.loyalty -> 'active') <> 'boolean' then
    raise exception 'loyalty.active must be a boolean' using errcode = '23514';
  end if;
  if new.loyalty ? 'points_per_currency_unit' and (
       jsonb_typeof(new.loyalty -> 'points_per_currency_unit') <> 'number'
       or (new.loyalty ->> 'points_per_currency_unit')::numeric < 0
       or (new.loyalty ->> 'points_per_currency_unit')::numeric > 1000) then
    raise exception 'loyalty.points_per_currency_unit is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tenant_settings_validate_loyalty before insert or update of loyalty on public.tenant_settings
  for each row execute function app.validate_loyalty_settings();

create or replace function public.loyalty_settings(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', coalesce((s.loyalty ->> 'active')::boolean, false) and app.tenant_has_feature(p_tenant, 'loyalty'),
    'points_per_currency_unit', coalesce((s.loyalty ->> 'points_per_currency_unit')::numeric, 1)
  )
  from public.tenant_settings s
  where s.tenant_id = p_tenant
$$;

revoke all on function public.loyalty_settings(uuid) from public;
grant execute on function public.loyalty_settings(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tiers: perks unlocked once a customer's lifetime points cross a threshold.
-- -----------------------------------------------------------------------------
create table public.loyalty_tiers (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  name             jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  threshold_points integer not null check (threshold_points >= 0),
  perks            text check (perks is null or length(perks) <= 300),
  active           boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id)
);

create index loyalty_tiers_tenant on public.loyalty_tiers (tenant_id, threshold_points);
create trigger loyalty_tiers_updated_at before update on public.loyalty_tiers
  for each row execute function app.set_updated_at();

alter table public.loyalty_tiers enable row level security;
grant select, insert, update, delete on public.loyalty_tiers to authenticated;
create policy loyalty_tiers_read on public.loyalty_tiers for select to authenticated
  using (app.has_permission(tenant_id, 'marketing.read') or app.has_permission(tenant_id, 'customers.read') or app.is_super_admin());
create policy loyalty_tiers_insert on public.loyalty_tiers for insert to authenticated
  with check (app.has_permission(tenant_id, 'marketing.write'));
create policy loyalty_tiers_update on public.loyalty_tiers for update to authenticated
  using (app.has_permission(tenant_id, 'marketing.write')) with check (app.has_permission(tenant_id, 'marketing.write'));
create policy loyalty_tiers_delete on public.loyalty_tiers for delete to authenticated
  using (app.has_permission(tenant_id, 'marketing.write'));
create trigger audit_loyalty_tiers after insert or update or delete on public.loyalty_tiers
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Rewards: what points can be redeemed for. Redemption is staff-applied (no
-- checkout discount-code system exists yet) — see redeem_loyalty_reward().
-- -----------------------------------------------------------------------------
create table public.loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  cost_points integer not null check (cost_points >= 1),
  kind        text not null check (kind in ('discount_percent', 'discount_fixed')),
  value       numeric not null check (value > 0),
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check (kind <> 'discount_percent' or value <= 100)
);

create index loyalty_rewards_tenant on public.loyalty_rewards (tenant_id, position);
create trigger loyalty_rewards_updated_at before update on public.loyalty_rewards
  for each row execute function app.set_updated_at();

alter table public.loyalty_rewards enable row level security;
grant select, insert, update, delete on public.loyalty_rewards to authenticated;
create policy loyalty_rewards_read on public.loyalty_rewards for select to authenticated
  using (app.has_permission(tenant_id, 'marketing.read') or app.has_permission(tenant_id, 'customers.read') or app.is_super_admin());
create policy loyalty_rewards_insert on public.loyalty_rewards for insert to authenticated
  with check (app.has_permission(tenant_id, 'marketing.write'));
create policy loyalty_rewards_update on public.loyalty_rewards for update to authenticated
  using (app.has_permission(tenant_id, 'marketing.write')) with check (app.has_permission(tenant_id, 'marketing.write'));
create policy loyalty_rewards_delete on public.loyalty_rewards for delete to authenticated
  using (app.has_permission(tenant_id, 'marketing.write'));
create trigger audit_loyalty_rewards after insert or update or delete on public.loyalty_rewards
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Ledger: append-only. A customer's balance is always sum(delta); their
-- lifetime total (which tiers are based on, so redeeming never demotes them)
-- is sum(delta) filter (where delta > 0).
-- -----------------------------------------------------------------------------
create table public.loyalty_ledger (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  delta       integer not null check (delta <> 0),
  reason      text not null check (reason in ('earned_order', 'redeemed_reward', 'manual_adjustment')),
  order_id    uuid,
  reward_id   uuid,
  note        text check (note is null or length(note) <= 300),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete set null (order_id),
  foreign key (tenant_id, reward_id) references public.loyalty_rewards (tenant_id, id) on delete set null (reward_id),
  check (reason <> 'earned_order' or (delta > 0 and order_id is not null)),
  check (reason <> 'redeemed_reward' or (delta < 0 and reward_id is not null))
);

create index loyalty_ledger_customer on public.loyalty_ledger (tenant_id, customer_id, created_at desc);
-- One earned-points row per order — makes awarding points idempotent.
create unique index loyalty_ledger_one_earn_per_order on public.loyalty_ledger (tenant_id, order_id)
  where reason = 'earned_order';

alter table public.loyalty_ledger enable row level security;
grant select on public.loyalty_ledger to authenticated;
create policy loyalty_ledger_read on public.loyalty_ledger for select to authenticated
  using (app.has_permission(tenant_id, 'marketing.read') or app.has_permission(tenant_id, 'customers.read') or app.is_super_admin());
-- No direct writes: every row is inserted by a function below (automatic
-- earn, or a permission-checked manual adjustment / redemption).

-- A customer's current balance, lifetime points and tier.
create or replace function public.loyalty_balance(p_tenant uuid, p_customer uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'balance', coalesce(sum(l.delta), 0),
    'lifetime_points', coalesce(sum(l.delta) filter (where l.delta > 0), 0),
    'tier', (
      select jsonb_build_object('id', t.id, 'name', t.name, 'threshold_points', t.threshold_points)
      from public.loyalty_tiers t
      where t.tenant_id = p_tenant and t.active
        and t.threshold_points <= coalesce((select sum(l2.delta) filter (where l2.delta > 0) from public.loyalty_ledger l2
                                             where l2.tenant_id = p_tenant and l2.customer_id = p_customer), 0)
      order by t.threshold_points desc
      limit 1
    )
  )
  from public.loyalty_ledger l
  where l.tenant_id = p_tenant and l.customer_id = p_customer
$$;

revoke all on function public.loyalty_balance(uuid, uuid) from public;
grant execute on function public.loyalty_balance(uuid, uuid) to authenticated, service_role;

-- Awards points for a just-paid order (called from record_order_payment /
-- confirm_online_payment below). Silently does nothing when loyalty is off,
-- the order has no linked customer, or points would round to zero.
create or replace function app.award_loyalty_points(p_order public.orders)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_exponent integer;
  v_points   integer;
begin
  if p_order.customer_id is null then
    return;
  end if;
  v_settings := public.loyalty_settings(p_order.tenant_id);
  if not coalesce((v_settings ->> 'active')::boolean, false) then
    return;
  end if;
  select exponent into v_exponent from public.currencies where code = p_order.currency;
  v_points := floor(p_order.total_minor::numeric / (10 ^ coalesce(v_exponent, 2))
                     * (v_settings ->> 'points_per_currency_unit')::numeric);
  if v_points <= 0 then
    return;
  end if;
  insert into public.loyalty_ledger (tenant_id, customer_id, delta, reason, order_id)
  values (p_order.tenant_id, p_order.customer_id, v_points, 'earned_order', p_order.id)
  on conflict (tenant_id, order_id) where (reason = 'earned_order') do nothing;
end;
$$;

-- Staff-only: a manual correction (goodwill points, fixing a mistake).
create or replace function public.adjust_loyalty_points(p_tenant uuid, p_customer uuid, p_delta integer, p_note text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_tenant, 'marketing.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_delta = 0 then
    raise exception 'invalid_delta' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where tenant_id = p_tenant and id = p_customer) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  if length(coalesce(p_note, '')) > 300 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  insert into public.loyalty_ledger (tenant_id, customer_id, delta, reason, note, created_by)
  values (p_tenant, p_customer, p_delta, 'manual_adjustment', nullif(btrim(p_note), ''), (select auth.uid()));
  return public.loyalty_balance(p_tenant, p_customer);
end;
$$;

revoke all on function public.adjust_loyalty_points(uuid, uuid, integer, text) from public, anon;
grant execute on function public.adjust_loyalty_points(uuid, uuid, integer, text) to authenticated;

-- Staff-only: redeems a reward on the customer's behalf (they're present in
-- person or on the phone). Returns the reward so staff can apply the
-- discount themselves — there is no checkout discount-code system yet.
create or replace function public.redeem_loyalty_reward(p_tenant uuid, p_customer uuid, p_reward uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r        public.loyalty_rewards%rowtype;
  v_balance integer;
begin
  if not app.has_permission(p_tenant, 'marketing.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.loyalty_rewards where tenant_id = p_tenant and id = p_reward and active;
  if r.id is null then
    raise exception 'invalid_reward' using errcode = '22023';
  end if;
  if not exists (select 1 from public.customers where tenant_id = p_tenant and id = p_customer) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select (public.loyalty_balance(p_tenant, p_customer) ->> 'balance')::integer into v_balance;
  if v_balance < r.cost_points then
    raise exception 'insufficient_points' using errcode = '22023';
  end if;

  insert into public.loyalty_ledger (tenant_id, customer_id, delta, reason, reward_id, created_by)
  values (p_tenant, p_customer, -r.cost_points, 'redeemed_reward', r.id, (select auth.uid()));

  return jsonb_build_object('reward_id', r.id, 'name', r.name, 'kind', r.kind, 'value', r.value);
end;
$$;

revoke all on function public.redeem_loyalty_reward(uuid, uuid, uuid) from public, anon;
grant execute on function public.redeem_loyalty_reward(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Hook point accrual into the two places an order becomes paid.
-- -----------------------------------------------------------------------------
create or replace function public.record_order_payment(p_order uuid, p_method text, p_note text default null)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not app.has_permission(o.tenant_id, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if o.payment_status <> 'unpaid' or o.status = 'cancelled' then
    raise exception 'already_paid_or_cancelled' using errcode = '22023';
  end if;
  if p_method not in ('cash', 'card_terminal', 'bank_transfer') or length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, recorded_by, note)
  values (o.tenant_id, o.id, 'manual', p_method, o.total_minor, o.currency, 'paid', (select auth.uid()), nullif(btrim(p_note), ''));
  update public.orders set payment_status = 'paid' where id = o.id;
  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_id, note)
  values (o.tenant_id, o.id, o.status, o.status, (select auth.uid()), 'payment:' || p_method);
  perform app.award_loyalty_points(o);
end;
$$;

create or replace function public.confirm_online_payment(
  p_provider text, p_provider_ref text, p_paid boolean, p_amount_minor bigint, p_currency text,
  p_event_id text default null, p_method text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where payment_intent_ref = p_provider_ref for update;
  if not found then
    raise exception 'unknown_reference' using errcode = '22023';
  end if;
  if p_event_id is not null and exists (
       select 1 from public.payments where provider = p_provider and provider_event_id = p_event_id) then
    return jsonb_build_object('result', 'already_processed', 'order_number', o.order_number);
  end if;
  if o.payment_status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'order_number', o.order_number);
  end if;
  if not p_paid then
    return jsonb_build_object('result', 'not_paid', 'order_number', o.order_number);
  end if;
  if o.status <> 'pending_payment' then
    return jsonb_build_object('result', 'not_pending', 'order_number', o.order_number);
  end if;
  if p_amount_minor <> o.total_minor or upper(p_currency) <> o.currency then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, provider_ref, provider_event_id)
  values (o.tenant_id, o.id, p_provider, coalesce(p_method, 'card'), o.total_minor, o.currency, 'paid', p_provider_ref, p_event_id);

  update public.orders set payment_status = 'paid', status = 'pending', expires_at = null where id = o.id;
  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, note)
  values (o.tenant_id, o.id, 'pending_payment', 'pending', 'payment:' || p_provider);
  perform app.award_loyalty_points(o);

  return jsonb_build_object('result', 'confirmed', 'order_number', o.order_number, 'tenant_id', o.tenant_id);
end;
$$;

revoke all on function public.confirm_online_payment(text, text, boolean, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_online_payment(text, text, boolean, bigint, text, text, text) to service_role;
