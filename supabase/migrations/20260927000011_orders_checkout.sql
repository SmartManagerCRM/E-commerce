-- =============================================================================
-- 0011 · Phase 5 — cart, checkout and orders
--
--   carts ─< cart_items            (guest cart per browser, keyed by a hashed cookie token)
--   customers ─< orders ─┬─< order_items          (price/name snapshots)
--                        ├─< order_status_history
--                        └─< payments             (pay on pickup/delivery; online payments in Phase 6)
--   delivery_zones ─< orders
--
-- * The browser never sends a price, total, tax, stock level or tenant id.
--   Storefront writes go through service-role-only functions that re-read
--   everything from the database; the tenant comes from the resolved host.
-- * Stock is reserved when an order is placed, deducted (ledger "sale") when
--   it is completed and released when it is cancelled.
-- * Staff change orders only through functions that enforce permissions and
--   the allowed status transitions, and record every change in the history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings validation (tenant_settings.checkout / .tax)
--   checkout: { accepting_orders, pickup, delivery, pay_on_fulfillment: bool,
--               min_order_minor: int|null }
--   tax:      { rate_bps: 0..10000, included: bool, registration_number: text|null }
-- -----------------------------------------------------------------------------
create or replace function app.validate_commerce_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  foreach k in array array['accepting_orders', 'pickup', 'delivery', 'pay_on_fulfillment'] loop
    if new.checkout ? k and jsonb_typeof(new.checkout -> k) <> 'boolean' then
      raise exception 'checkout.% must be a boolean', k using errcode = '23514';
    end if;
  end loop;
  if new.checkout ? 'min_order_minor' and jsonb_typeof(new.checkout -> 'min_order_minor') <> 'null'
     and (jsonb_typeof(new.checkout -> 'min_order_minor') <> 'number'
          or (new.checkout ->> 'min_order_minor')::numeric <> trunc((new.checkout ->> 'min_order_minor')::numeric)
          or (new.checkout ->> 'min_order_minor')::numeric not between 0 and 1e12) then
    raise exception 'checkout.min_order_minor is invalid' using errcode = '23514';
  end if;
  if new.tax ? 'rate_bps' and (jsonb_typeof(new.tax -> 'rate_bps') <> 'number'
       or (new.tax ->> 'rate_bps')::numeric <> trunc((new.tax ->> 'rate_bps')::numeric)
       or (new.tax ->> 'rate_bps')::numeric not between 0 and 10000) then
    raise exception 'tax.rate_bps is invalid' using errcode = '23514';
  end if;
  if new.tax ? 'included' and jsonb_typeof(new.tax -> 'included') <> 'boolean' then
    raise exception 'tax.included must be a boolean' using errcode = '23514';
  end if;
  if new.tax ? 'registration_number' and jsonb_typeof(new.tax -> 'registration_number') not in ('string', 'null') then
    raise exception 'tax.registration_number is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tenant_settings_validate_commerce before insert or update of checkout, tax on public.tenant_settings
  for each row execute function app.validate_commerce_settings();

-- Normalised settings with safe defaults (ordering is off until the owner enables it).
create or replace function app.commerce_settings(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accepting_orders', coalesce((s.checkout ->> 'accepting_orders')::boolean, false),
    'pickup', coalesce((s.checkout ->> 'pickup')::boolean, true),
    'delivery', coalesce((s.checkout ->> 'delivery')::boolean, false) and app.tenant_has_feature(p_tenant, 'delivery'),
    'pay_on_fulfillment', coalesce((s.checkout ->> 'pay_on_fulfillment')::boolean, true),
    'min_order_minor', (s.checkout ->> 'min_order_minor')::bigint,
    'tax_rate_bps', coalesce((s.tax ->> 'rate_bps')::integer, 0),
    'tax_included', coalesce((s.tax ->> 'included')::boolean, true),
    'tax_registration_number', nullif(btrim(s.tax ->> 'registration_number'), '')
  )
  from public.tenant_settings s
  where s.tenant_id = p_tenant
$$;

revoke all on function app.commerce_settings(uuid) from public;

-- Integer division rounding half up (amounts are never negative here).
create or replace function app.div_round(n bigint, d bigint)
returns bigint
language sql immutable parallel safe
set search_path = ''
as $$ select (2 * n + d) / (2 * d) $$;

-- -----------------------------------------------------------------------------
-- Per-tenant counters (order numbers)
-- -----------------------------------------------------------------------------
create table public.tenant_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key       text not null check (key ~ '^[a-z_]{1,40}$'),
  value     bigint not null,
  primary key (tenant_id, key)
);

alter table public.tenant_counters enable row level security;
-- No policies: only security-definer functions use it.

create or replace function app.next_counter(p_tenant uuid, p_key text, p_start bigint)
returns bigint
language sql volatile security definer
set search_path = ''
as $$
  insert into public.tenant_counters as c (tenant_id, key, value) values (p_tenant, p_key, p_start)
  on conflict (tenant_id, key) do update set value = c.value + 1
  returning value
$$;

revoke all on function app.next_counter(uuid, text, bigint) from public;

-- -----------------------------------------------------------------------------
-- Delivery zones (the customer picks one at checkout; fees come from here)
-- -----------------------------------------------------------------------------
create table public.delivery_zones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  name            jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  fee_minor       bigint not null default 0 check (fee_minor >= 0),
  min_order_minor bigint check (min_order_minor is null or min_order_minor >= 0),
  free_over_minor bigint check (free_over_minor is null or free_over_minor >= 0),
  eta_minutes     integer check (eta_minutes is null or eta_minutes between 0 and 10080),
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id)
);

create index delivery_zones_tenant on public.delivery_zones (tenant_id, position);
create trigger delivery_zones_updated_at before update on public.delivery_zones
  for each row execute function app.set_updated_at();

alter table public.delivery_zones enable row level security;
grant select, insert, update, delete on public.delivery_zones to authenticated;
create policy delivery_zones_read on public.delivery_zones for select to authenticated
  using (app.has_permission(tenant_id, 'settings.read') or app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
create policy delivery_zones_insert on public.delivery_zones for insert to authenticated
  with check (app.has_permission(tenant_id, 'settings.write'));
create policy delivery_zones_update on public.delivery_zones for update to authenticated
  using (app.has_permission(tenant_id, 'settings.write')) with check (app.has_permission(tenant_id, 'settings.write'));
create policy delivery_zones_delete on public.delivery_zones for delete to authenticated
  using (app.has_permission(tenant_id, 'settings.write'));
create trigger audit_delivery_zones after insert or update or delete on public.delivery_zones
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Customers (created at checkout; one per tenant + email)
-- -----------------------------------------------------------------------------
create table public.customers (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  auth_user_id         uuid,
  email                extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,24}$'),
  full_name            text not null check (length(btrim(full_name)) between 1 and 120),
  locale               text check (locale is null or locale in ('en', 'fr', 'ar')),
  marketing_consent    boolean not null default false,
  consent_at           timestamptz,
  first_order_at       timestamptz,
  last_order_at        timestamptz,
  orders_count         integer not null default 0,
  lifetime_value_minor bigint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, email)
);

create index customers_tenant_last_order on public.customers (tenant_id, last_order_at desc nulls last);
create trigger customers_updated_at before update on public.customers
  for each row execute function app.set_updated_at();

alter table public.customers enable row level security;
grant select on public.customers to authenticated;
create policy customers_read on public.customers for select to authenticated
  using (app.has_permission(tenant_id, 'customers.read') or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Carts (guest): the browser holds a random token; only its hash is stored.
-- -----------------------------------------------------------------------------
create table public.carts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status           text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
  customer_id      uuid,
  order_id         uuid,
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id)
);

create index carts_tenant_activity on public.carts (tenant_id, status, last_activity_at);

create table public.cart_items (
  tenant_id  uuid not null,
  cart_id    uuid not null,
  variant_id uuid not null,
  qty        integer not null check (qty between 1 and 99),
  added_at   timestamptz not null default now(),
  primary key (cart_id, variant_id),
  foreign key (tenant_id, cart_id) references public.carts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
-- No policies or grants: carts are only reachable through the service-role functions below.

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  branch_id           uuid not null,
  customer_id         uuid,
  order_number        text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  payment_status      text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  payment_method      text not null default 'pay_on_fulfillment' check (payment_method in ('pay_on_fulfillment')),
  fulfillment_type    text not null check (fulfillment_type in ('pickup', 'delivery')),
  delivery_zone_id    uuid,
  subtotal_minor      bigint not null check (subtotal_minor >= 0),
  discount_minor      bigint not null default 0 check (discount_minor >= 0),
  delivery_fee_minor  bigint not null default 0 check (delivery_fee_minor >= 0),
  tax_minor           bigint not null default 0 check (tax_minor >= 0),
  total_minor         bigint not null check (total_minor >= 0),
  currency            char(3) not null,
  tax_rate_bps        integer not null default 0,
  tax_included        boolean not null default true,
  contact             jsonb not null check (jsonb_typeof(contact) = 'object'),
  shipping_address    jsonb check (shipping_address is null or jsonb_typeof(shipping_address) = 'object'),
  delivery_zone_name  jsonb,
  notes               text check (notes is null or length(notes) <= 1000),
  locale              text not null default 'en',
  access_token_hash   text not null check (access_token_hash ~ '^[0-9a-f]{64}$'),
  placed_at           timestamptz not null default now(),
  confirmed_at        timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text check (cancel_reason is null or length(cancel_reason) <= 500),
  archived_at         timestamptz,
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_number),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id),
  foreign key (tenant_id, delivery_zone_id) references public.delivery_zones (tenant_id, id) on delete set null (delivery_zone_id),
  check (fulfillment_type = 'pickup' or shipping_address is not null),
  check (total_minor = subtotal_minor - discount_minor + delivery_fee_minor + case when tax_included then 0 else tax_minor end)
);

create index orders_tenant_placed on public.orders (tenant_id, placed_at desc);
create index orders_tenant_status on public.orders (tenant_id, status, placed_at desc);
create index orders_customer on public.orders (tenant_id, customer_id, placed_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function app.set_updated_at();

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  order_id          uuid not null,
  variant_id        uuid,
  product_id        uuid,
  inventory_item_id uuid,
  reserved_qty      integer not null default 0 check (reserved_qty >= 0),
  snapshot          jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  unit_price_minor  bigint not null check (unit_price_minor >= 0),
  qty               integer not null check (qty between 1 and 99),
  total_minor       bigint not null check (total_minor = unit_price_minor * qty),
  position          integer not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete set null (variant_id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete set null (product_id),
  foreign key (tenant_id, inventory_item_id) references public.inventory_items (tenant_id, id) on delete set null (inventory_item_id)
);

create index order_items_order on public.order_items (order_id, position);
create index order_items_product on public.order_items (tenant_id, product_id);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  order_id    uuid not null,
  from_status text,
  to_status   text not null,
  actor_id    uuid,
  note        text check (note is null or length(note) <= 500),
  at          timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);

create index order_status_history_order on public.order_status_history (order_id, at);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  order_id     uuid not null,
  provider     text not null check (provider in ('manual')),
  method       text not null check (method in ('cash', 'card_terminal', 'bank_transfer')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency     char(3) not null,
  status       text not null check (status in ('paid')),
  recorded_by  uuid,
  note         text check (note is null or length(note) <= 500),
  paid_at      timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);

create unique index payments_one_manual_per_order on public.payments (order_id) where provider = 'manual';

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;

-- Staff read with orders.read; every write goes through the functions below.
grant select on public.orders, public.order_items, public.order_status_history, public.payments to authenticated;
create policy orders_read on public.orders for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
create policy order_items_read on public.order_items for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
create policy order_status_history_read on public.order_status_history for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
create policy payments_read on public.payments for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());

create trigger audit_orders after update on public.orders for each row execute function app.audit_row_change();
create trigger audit_payments after insert on public.payments for each row execute function app.audit_row_change();

-- =============================================================================
-- Cart pricing (single source of truth for cart, checkout and order)
-- =============================================================================

-- Current cart lines with live prices and availability.
create or replace function app.cart_lines(p_cart uuid)
returns table (
  variant_id uuid, product_id uuid, product_slug text, product_name jsonb, option_labels jsonb,
  image_path text, sku text, unit_price_minor bigint, compare_at_minor bigint, qty integer,
  inventory_item_id uuid, track_stock boolean, allow_backorder boolean, available integer,
  purchasable boolean, line_no bigint
)
language sql stable security definer
set search_path = ''
as $$
  select v.id, p.id, p.slug, p.name,
         (select coalesce(jsonb_agg(jsonb_build_object('option', o.name, 'value', ov.label) order by o.position), '[]'::jsonb)
            from public.product_option_values ov join public.product_options o on o.id = ov.option_id
            where ov.id = any (v.option_value_ids)),
         coalesce((select i.storage_path from public.product_images i where i.id = v.image_id),
                  (select i.storage_path from public.product_images i where i.product_id = p.id order by i.position limit 1)),
         v.sku, v.price_minor, v.compare_at_minor, ci.qty,
         inv.id, coalesce(inv.track_stock, false), coalesce(inv.allow_backorder, false),
         coalesce(inv.on_hand - inv.reserved, 0),
         (v.status = 'active' and p.status = 'active'),
         row_number() over (order by ci.added_at, v.id)
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  join public.product_variants v on v.id = ci.variant_id and v.tenant_id = c.tenant_id
  join public.products p on p.id = v.product_id
  left join public.inventory_items inv on inv.variant_id = v.id
    and inv.branch_id = (select b.id from public.branches b where b.tenant_id = c.tenant_id and b.is_default)
  where ci.cart_id = p_cart
$$;

revoke all on function app.cart_lines(uuid) from public;

-- Quote for a cart and a fulfillment choice. Returns amounts and blocking problems.
create or replace function app.quote(p_tenant uuid, p_cart uuid, p_fulfillment text, p_zone uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s          jsonb := app.commerce_settings(p_tenant);
  v_subtotal bigint := 0;
  v_fee      bigint := 0;
  v_tax      bigint := 0;
  v_rate     integer := coalesce((s ->> 'tax_rate_bps')::integer, 0);
  v_included boolean := coalesce((s ->> 'tax_included')::boolean, true);
  v_problems text[] := '{}';
  v_count    integer := 0;
  v_lines    integer := 0;
  z          public.delivery_zones%rowtype;
  l          record;
begin
  for l in select * from app.cart_lines(p_cart) loop
    v_lines := v_lines + 1;
    if not l.purchasable then
      v_problems := array_append(v_problems, 'unavailable_items');
    elsif l.track_stock and not l.allow_backorder and l.available < l.qty then
      v_problems := array_append(v_problems, 'insufficient_stock');
    else
      v_subtotal := v_subtotal + l.unit_price_minor * l.qty;
      v_count := v_count + l.qty;
    end if;
  end loop;
  if v_lines = 0 then
    v_problems := array_append(v_problems, 'empty_cart');
  end if;

  if not coalesce((s ->> 'accepting_orders')::boolean, false) or not app.tenant_has_feature(p_tenant, 'orders')
     or not coalesce((s ->> 'pay_on_fulfillment')::boolean, false) then
    v_problems := array_append(v_problems, 'ordering_closed');
  end if;

  if p_fulfillment = 'pickup' then
    if not coalesce((s ->> 'pickup')::boolean, false) then v_problems := array_append(v_problems, 'fulfillment_unavailable'); end if;
  elsif p_fulfillment = 'delivery' then
    select * into z from public.delivery_zones dz where dz.id = p_zone and dz.tenant_id = p_tenant and dz.active;
    if not coalesce((s ->> 'delivery')::boolean, false) or z.id is null then
      v_problems := array_append(v_problems, 'fulfillment_unavailable');
    else
      v_fee := case when z.free_over_minor is not null and v_subtotal >= z.free_over_minor then 0 else z.fee_minor end;
      if z.min_order_minor is not null and v_subtotal < z.min_order_minor then
        v_problems := array_append(v_problems, 'below_minimum');
      end if;
    end if;
  else
    v_problems := array_append(v_problems, 'fulfillment_unavailable');
  end if;

  if (s ->> 'min_order_minor') is not null and v_subtotal < (s ->> 'min_order_minor')::bigint then
    v_problems := array_append(v_problems, 'below_minimum');
  end if;

  -- Tax applies to goods and delivery. Included: extracted from the prices; excluded: added on top.
  if v_rate > 0 then
    v_tax := case when v_included then app.div_round((v_subtotal + v_fee) * v_rate, 10000 + v_rate)
                  else app.div_round((v_subtotal + v_fee) * v_rate, 10000) end;
  end if;

  return jsonb_build_object(
    'subtotal_minor', v_subtotal,
    'delivery_fee_minor', v_fee,
    'tax_minor', v_tax,
    'tax_rate_bps', v_rate,
    'tax_included', v_included,
    'total_minor', v_subtotal + v_fee + case when v_included then 0 else v_tax end,
    'item_count', v_count,
    'problems', (select coalesce(jsonb_agg(distinct p), '[]'::jsonb) from unnest(v_problems) p)
  );
end;
$$;

revoke all on function app.quote(uuid, uuid, text, uuid) from public;

create or replace function app.find_cart(p_tenant uuid, p_token_hash text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select c.id from public.carts c
  where c.tenant_id = p_tenant and c.token_hash = p_token_hash and c.status = 'active'
$$;

revoke all on function app.find_cart(uuid, text) from public;

-- =============================================================================
-- Storefront functions (service_role only; called by server code with the
-- tenant resolved from the request host)
-- =============================================================================

-- Public ordering options: is ordering open, fulfillment methods, zones, tax display.
create or replace function public.storefront_checkout_options(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with s as (select app.commerce_settings(p_tenant) as v)
  select jsonb_build_object(
    'ordering_open', (s.v ->> 'accepting_orders')::boolean and (s.v ->> 'pay_on_fulfillment')::boolean
                     and app.tenant_has_feature(p_tenant, 'orders')
                     and ((s.v ->> 'pickup')::boolean
                          or ((s.v ->> 'delivery')::boolean and exists (select 1 from public.delivery_zones z where z.tenant_id = p_tenant and z.active))),
    'pickup', (s.v ->> 'pickup')::boolean,
    'delivery', (s.v ->> 'delivery')::boolean,
    'min_order_minor', s.v -> 'min_order_minor',
    'tax_rate_bps', s.v -> 'tax_rate_bps',
    'tax_included', s.v -> 'tax_included',
    'zones', case when (s.v ->> 'delivery')::boolean then coalesce((
               select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee_minor', z.fee_minor,
                        'min_order_minor', z.min_order_minor, 'free_over_minor', z.free_over_minor,
                        'eta_minutes', z.eta_minutes) order by z.position, z.created_at)
               from public.delivery_zones z where z.tenant_id = p_tenant and z.active), '[]'::jsonb)
             else '[]'::jsonb end
  )
  from s
  join public.tenants t on t.id = p_tenant and t.status = 'active'
$$;

-- Adds (mode 'add') or sets (mode 'set'; 0 removes) a cart line. Creates the cart on first add.
create or replace function public.cart_update(p_tenant uuid, p_token_hash text, p_variant uuid, p_qty integer, p_mode text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_cart     uuid;
  v_current  integer;
  v_new      integer;
  v_ok       boolean;
  inv        public.inventory_items%rowtype;
begin
  if p_mode not in ('add', 'set') or p_qty is null or p_qty < 0 or p_qty > 99 or (p_mode = 'add' and p_qty = 0) then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.status = 'active') then
    raise exception 'store_unavailable' using errcode = '22023';
  end if;

  select (v.status = 'active' and p.status = 'active') into v_ok
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = p_variant and v.tenant_id = p_tenant;
  if v_ok is null or (not v_ok and p_mode = 'add') then
    raise exception 'unavailable' using errcode = '22023';
  end if;

  v_cart := app.find_cart(p_tenant, p_token_hash);
  if v_cart is null then
    if p_mode = 'set' then
      return public.cart_view(p_tenant, p_token_hash);
    end if;
    insert into public.carts (tenant_id, token_hash) values (p_tenant, p_token_hash) returning id into v_cart;
  end if;

  select qty into v_current from public.cart_items where cart_id = v_cart and variant_id = p_variant;
  v_new := least(99, case when p_mode = 'add' then coalesce(v_current, 0) + p_qty else p_qty end);

  -- Never put more in the cart than can be sold.
  select i.* into inv from public.inventory_items i
  join public.branches b on b.id = i.branch_id and b.is_default
  where i.variant_id = p_variant;
  if inv.id is not null and inv.track_stock and not inv.allow_backorder then
    if inv.on_hand - inv.reserved <= 0 and v_new > 0 then
      raise exception 'out_of_stock' using errcode = '22023';
    end if;
    v_new := least(v_new, inv.on_hand - inv.reserved);
  end if;

  if v_new = 0 then
    delete from public.cart_items where cart_id = v_cart and variant_id = p_variant;
  else
    insert into public.cart_items (tenant_id, cart_id, variant_id, qty) values (p_tenant, v_cart, p_variant, v_new)
    on conflict (cart_id, variant_id) do update set qty = excluded.qty;
  end if;
  update public.carts set last_activity_at = now() where id = v_cart;

  return public.cart_view(p_tenant, p_token_hash) || jsonb_build_object('limited',
    p_mode = 'add' and v_new < least(99, coalesce(v_current, 0) + p_qty));
end;
$$;

-- Cart contents with live prices (no stock quantities: only whether each line can be fulfilled).
create or replace function public.cart_view(p_tenant uuid, p_token_hash text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_cart uuid := app.find_cart(p_tenant, p_token_hash);
begin
  if v_cart is null then
    return jsonb_build_object('items', '[]'::jsonb, 'item_count', 0, 'subtotal_minor', 0);
  end if;
  return (
    select jsonb_build_object(
      'items', coalesce(jsonb_agg(jsonb_build_object(
          'variant_id', l.variant_id, 'product_slug', l.product_slug, 'name', l.product_name,
          'options', l.option_labels, 'image_path', l.image_path, 'unit_price_minor', l.unit_price_minor,
          'compare_at_minor', l.compare_at_minor, 'qty', l.qty, 'line_total_minor', l.unit_price_minor * l.qty,
          'status', case when not l.purchasable then 'unavailable'
                         when l.track_stock and not l.allow_backorder and l.available <= 0 then 'out_of_stock'
                         when l.track_stock and not l.allow_backorder and l.available < l.qty then 'insufficient_stock'
                         else 'ok' end
        ) order by l.line_no), '[]'::jsonb),
      'item_count', coalesce(sum(l.qty) filter (where l.purchasable), 0),
      'subtotal_minor', coalesce(sum(l.unit_price_minor * l.qty) filter (where l.purchasable), 0)
    )
    from app.cart_lines(v_cart) l
  );
end;
$$;

-- Quote shown on the checkout page (the order itself is priced again at placement).
create or replace function public.checkout_quote(p_tenant uuid, p_token_hash text, p_fulfillment text, p_zone uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_cart uuid := app.find_cart(p_tenant, p_token_hash);
begin
  if v_cart is null then
    return jsonb_build_object('subtotal_minor', 0, 'delivery_fee_minor', 0, 'tax_minor', 0, 'total_minor', 0,
                              'item_count', 0, 'problems', '["empty_cart"]'::jsonb);
  end if;
  return app.quote(p_tenant, v_cart, p_fulfillment, p_zone);
end;
$$;

-- Places the order: re-prices the cart, checks stock, reserves it, snapshots
-- the lines and converts the cart — all in one transaction.
--   p_checkout = { fulfillment, zone_id?, contact: {name, email, phone}, address?: {line1, line2?, city, notes?},
--                  notes?, locale, marketing_consent, access_token_hash }
create or replace function public.create_order_from_cart(p_tenant uuid, p_token_hash text, p_checkout jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_cart     uuid;
  v_quote    jsonb;
  v_order    uuid;
  v_number   bigint;
  v_customer uuid;
  v_branch   uuid;
  v_currency char(3);
  v_zone     public.delivery_zones%rowtype;
  v_fulfill  text := p_checkout ->> 'fulfillment';
  v_zone_id  uuid;
  v_contact  jsonb;
  v_address  jsonb;
  v_locale   text := coalesce(nullif(p_checkout ->> 'locale', ''), 'en');
  v_consent  boolean := coalesce((p_checkout ->> 'marketing_consent')::boolean, false);
  l          record;
  inv        public.inventory_items%rowtype;
  v_pos      integer := 0;
begin
  if v_fulfill = 'delivery' then
    v_zone_id := (p_checkout ->> 'zone_id')::uuid;
  end if;

  v_cart := app.find_cart(p_tenant, p_token_hash);
  if v_cart is null then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  -- Serialise concurrent submissions of the same cart.
  perform 1 from public.carts where id = v_cart for update;
  if not found or (select status from public.carts where id = v_cart) <> 'active' then
    raise exception 'empty_cart' using errcode = '22023';
  end if;

  -- Lock the stock rows of every line (in a stable order) before checking availability.
  perform 1 from public.inventory_items i
  where i.id in (select l2.inventory_item_id from app.cart_lines(v_cart) l2 where l2.inventory_item_id is not null)
  order by i.id for update;

  v_quote := app.quote(p_tenant, v_cart, v_fulfill, v_zone_id);
  if jsonb_array_length(v_quote -> 'problems') > 0 then
    raise exception '%', v_quote ->> 'problems' using errcode = '22023', hint = 'checkout_problems';
  end if;

  -- Contact and address (validated again here; the app validates first).
  v_contact := jsonb_build_object(
    'name', btrim(p_checkout #>> '{contact,name}'),
    'email', lower(btrim(p_checkout #>> '{contact,email}')),
    'phone', nullif(btrim(p_checkout #>> '{contact,phone}'), ''));
  if coalesce(length(v_contact ->> 'name'), 0) not between 1 and 120
     or (v_contact ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_contact ->> 'email') > 254
     or ((v_contact ->> 'phone') is not null and (v_contact ->> 'phone') !~ '^\+?[0-9 ()-]{6,24}$') then
    raise exception 'invalid_contact' using errcode = '22023';
  end if;
  if v_fulfill = 'delivery' then
    if (v_contact ->> 'phone') is null then
      raise exception 'phone_required' using errcode = '22023';
    end if;
    v_address := jsonb_strip_nulls(jsonb_build_object(
      'line1', nullif(btrim(p_checkout #>> '{address,line1}'), ''),
      'line2', nullif(btrim(p_checkout #>> '{address,line2}'), ''),
      'city', nullif(btrim(p_checkout #>> '{address,city}'), ''),
      'notes', nullif(btrim(p_checkout #>> '{address,notes}'), '')));
    if (v_address ->> 'line1') is null or length(v_address ->> 'line1') > 200
       or length(coalesce(v_address ->> 'line2', '')) > 200 or length(coalesce(v_address ->> 'city', '')) > 100
       or length(coalesce(v_address ->> 'notes', '')) > 300 then
      raise exception 'invalid_address' using errcode = '22023';
    end if;
    select * into v_zone from public.delivery_zones where id = v_zone_id;
  end if;
  if length(coalesce(p_checkout ->> 'notes', '')) > 1000 or v_locale not in ('en', 'fr', 'ar')
     or coalesce(p_checkout ->> 'access_token_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_checkout' using errcode = '22023';
  end if;

  select b.id into v_branch from public.branches b where b.tenant_id = p_tenant and b.is_default;
  select t.currency into v_currency from public.tenants t where t.id = p_tenant;

  -- Customer: one per email; details refreshed from the latest order.
  insert into public.customers as c (tenant_id, email, phone, full_name, locale, marketing_consent, consent_at,
                                     first_order_at, last_order_at, orders_count)
  values (p_tenant, v_contact ->> 'email', v_contact ->> 'phone', v_contact ->> 'name', v_locale, v_consent,
          case when v_consent then now() end, now(), now(), 1)
  on conflict (tenant_id, email) do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, c.phone),
    locale = excluded.locale,
    marketing_consent = c.marketing_consent or excluded.marketing_consent,
    consent_at = case when not c.marketing_consent and excluded.marketing_consent then now() else c.consent_at end,
    last_order_at = now(),
    orders_count = c.orders_count + 1
  returning id into v_customer;

  v_number := app.next_counter(p_tenant, 'order_number', 1001);

  insert into public.orders (tenant_id, branch_id, customer_id, order_number, fulfillment_type, delivery_zone_id,
                             delivery_zone_name, subtotal_minor, delivery_fee_minor, tax_minor, total_minor, currency,
                             tax_rate_bps, tax_included, contact, shipping_address, notes, locale, access_token_hash)
  values (p_tenant, v_branch, v_customer, v_number::text, v_fulfill, v_zone.id, v_zone.name,
          (v_quote ->> 'subtotal_minor')::bigint, (v_quote ->> 'delivery_fee_minor')::bigint,
          (v_quote ->> 'tax_minor')::bigint, (v_quote ->> 'total_minor')::bigint, v_currency,
          (v_quote ->> 'tax_rate_bps')::integer, (v_quote ->> 'tax_included')::boolean,
          v_contact, v_address, nullif(btrim(p_checkout ->> 'notes'), ''), v_locale, p_checkout ->> 'access_token_hash')
  returning id into v_order;

  for l in select * from app.cart_lines(v_cart) order by line_no loop
    insert into public.order_items (tenant_id, order_id, variant_id, product_id, inventory_item_id, reserved_qty,
                                    snapshot, unit_price_minor, qty, total_minor, position)
    values (p_tenant, v_order, l.variant_id, l.product_id,
            case when l.track_stock then l.inventory_item_id end,
            case when l.track_stock then l.qty else 0 end,
            jsonb_build_object('name', l.product_name, 'slug', l.product_slug, 'sku', l.sku,
                               'options', l.option_labels, 'image_path', l.image_path),
            l.unit_price_minor, l.qty, l.unit_price_minor * l.qty, v_pos);
    if l.track_stock then
      update public.inventory_items set reserved = reserved + l.qty where id = l.inventory_item_id;
    end if;
    v_pos := v_pos + 1;
  end loop;

  insert into public.order_status_history (tenant_id, order_id, from_status, to_status)
  values (p_tenant, v_order, null, 'pending');

  update public.carts set status = 'converted', order_id = v_order, customer_id = v_customer, last_activity_at = now()
  where id = v_cart;

  return jsonb_build_object('order_id', v_order, 'order_number', v_number::text, 'total_minor', v_quote -> 'total_minor');
end;
$$;

-- Order status page for the customer (order number + private link token).
create or replace function public.storefront_order(p_tenant uuid, p_number text, p_token_hash text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
    'fulfillment_type', o.fulfillment_type, 'delivery_zone_name', o.delivery_zone_name,
    'subtotal_minor', o.subtotal_minor, 'delivery_fee_minor', o.delivery_fee_minor, 'tax_minor', o.tax_minor,
    'tax_rate_bps', o.tax_rate_bps, 'tax_included', o.tax_included, 'total_minor', o.total_minor,
    'currency', o.currency, 'contact', o.contact, 'shipping_address', o.shipping_address, 'notes', o.notes,
    'placed_at', o.placed_at, 'cancel_reason', case when o.status = 'cancelled' then o.cancel_reason end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('snapshot', i.snapshot, 'unit_price_minor', i.unit_price_minor,
                'qty', i.qty, 'total_minor', i.total_minor) order by i.position), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.at) order by h.at), '[]'::jsonb)
                from public.order_status_history h where h.order_id = o.id)
  )
  from public.orders o
  where o.tenant_id = p_tenant and o.order_number = p_number and o.access_token_hash = p_token_hash
$$;

-- Best sellers for the homepage section (non-cancelled orders, last 90 days).
create or replace function public.storefront_best_sellers(p_tenant uuid, p_limit integer default 8)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select app.product_cards(coalesce(array_agg(product_id order by sold desc, product_id), '{}'))
  from (
    select i.product_id, sum(i.qty) as sold
    from public.order_items i
    join public.orders o on o.id = i.order_id and o.status <> 'cancelled' and o.placed_at > now() - interval '90 days'
    join public.products p on p.id = i.product_id and p.status = 'active' and p.price_min_minor is not null
    join public.tenants t on t.id = o.tenant_id and t.status = 'active'
    where i.tenant_id = p_tenant
    group by i.product_id
    order by sold desc, i.product_id
    limit least(greatest(p_limit, 1), 24)
  ) s
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.storefront_checkout_options(uuid)',
    'public.cart_update(uuid, text, uuid, integer, text)',
    'public.cart_view(uuid, text)',
    'public.checkout_quote(uuid, text, text, uuid)',
    'public.create_order_from_cart(uuid, text, jsonb)',
    'public.storefront_order(uuid, text, text)',
    'public.storefront_best_sellers(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- =============================================================================
-- Staff functions (authenticated; permission-checked; history recorded)
-- =============================================================================

create or replace function app.allowed_next_statuses(p_status text, p_fulfillment text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select case p_status
    when 'pending' then array['confirmed', 'cancelled']
    when 'confirmed' then array['preparing', case when p_fulfillment = 'delivery' then 'out_for_delivery' else 'ready' end, 'completed', 'cancelled']
    when 'preparing' then array[case when p_fulfillment = 'delivery' then 'out_for_delivery' else 'ready' end, 'completed', 'cancelled']
    when 'ready' then array['completed', 'cancelled']
    when 'out_for_delivery' then array['completed', 'cancelled']
    else array[]::text[]
  end
$$;

create or replace function public.update_order_status(p_order uuid, p_status text, p_note text default null)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  i record;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if not app.has_permission(o.tenant_id, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not (p_status = any (app.allowed_next_statuses(o.status, o.fulfillment_type))) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  if p_status in ('completed', 'cancelled') then
    for i in select * from public.order_items where order_id = o.id and inventory_item_id is not null and reserved_qty > 0
             order by inventory_item_id for update loop
      if p_status = 'completed' then
        -- Reserved stock leaves the shelf: ledger entry "sale".
        update public.inventory_items set on_hand = on_hand - i.reserved_qty, reserved = greatest(reserved - i.reserved_qty, 0)
        where id = i.inventory_item_id;
        insert into public.stock_movements (tenant_id, inventory_item_id, delta, on_hand_after, reason, actor_user_id, order_id)
        select o.tenant_id, inv.id, -i.reserved_qty, inv.on_hand, 'sale', (select auth.uid()), o.id
        from public.inventory_items inv where inv.id = i.inventory_item_id;
      else
        update public.inventory_items set reserved = greatest(reserved - i.reserved_qty, 0) where id = i.inventory_item_id;
      end if;
      update public.order_items set reserved_qty = 0 where id = i.id;
    end loop;
  end if;

  update public.orders set
    status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_status = 'cancelled' then nullif(btrim(p_note), '') else cancel_reason end
  where id = o.id;

  if p_status = 'completed' and o.customer_id is not null then
    update public.customers set lifetime_value_minor = lifetime_value_minor + o.total_minor where id = o.customer_id;
  end if;

  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_id, note)
  values (o.tenant_id, o.id, o.status, p_status, (select auth.uid()), nullif(btrim(p_note), ''));
  return p_status;
end;
$$;

-- Records payment collected at pickup/delivery (cash, card terminal, transfer).
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
end;
$$;

-- Dashboard figures for "today" in the tenant's time zone.
create or replace function public.sales_summary(p_tenant uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  if not (app.has_permission(p_tenant, 'orders.read') or app.is_super_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select date_trunc('day', now() at time zone t.timezone) at time zone t.timezone into v_start
  from public.tenants t where t.id = p_tenant;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders o where o.tenant_id = p_tenant and o.placed_at >= v_start and o.status <> 'cancelled'),
    'revenue_today_minor', (select coalesce(sum(o.total_minor), 0) from public.orders o
                            where o.tenant_id = p_tenant and o.placed_at >= v_start and o.status <> 'cancelled'),
    'open_orders', (select count(*) from public.orders o where o.tenant_id = p_tenant
                      and o.status in ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery')),
    'pending_orders', (select count(*) from public.orders o where o.tenant_id = p_tenant and o.status = 'pending'),
    'customers', (select count(*) from public.customers c where c.tenant_id = p_tenant)
  );
end;
$$;

revoke all on function public.update_order_status(uuid, text, text) from public, anon;
revoke all on function public.record_order_payment(uuid, text, text) from public, anon;
revoke all on function public.sales_summary(uuid) from public, anon;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;
grant execute on function public.record_order_payment(uuid, text, text) to authenticated;
grant execute on function public.sales_summary(uuid) to authenticated;

-- Staff may adjust stock only down to what is already reserved for open orders.
create or replace function app.guard_reserved_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.on_hand < new.reserved and not new.allow_backorder and new.on_hand < old.on_hand then
    raise exception 'Stock cannot go below what is reserved for open orders' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger inventory_items_guard_reserved before update of on_hand on public.inventory_items
  for each row execute function app.guard_reserved_stock();
