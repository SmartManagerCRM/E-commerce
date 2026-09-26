-- =============================================================================
-- 0012 · Phase 6 — online payments (Moyasar)
--
--   tenants ─< payment_provider_configs
--   orders ─< payments   (extended: online providers alongside pay-on-fulfillment)
--
-- * The card form is hosted by the provider; card data never touches our
--   servers. Our server only ever sees the provider's public (publishable)
--   key and a payment reference.
-- * Provider secret keys and webhook signing secrets are stored in Supabase
--   Vault, never in a plain column, and are only ever read by a
--   service-role-only function called from server code just before an
--   outbound API call.
-- * An order paid online is created `pending_payment` with stock reserved
--   and a 15-minute hold; `confirm_online_payment()` is the single,
--   idempotent entry point both the return page and the webhook call to
--   mark it paid. A cron sweep cancels and releases anything left unpaid
--   past its hold.
-- =============================================================================

create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Provider configuration (one row per tenant + provider; secrets in Vault)
-- -----------------------------------------------------------------------------
create table public.payment_provider_configs (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  provider                 text not null check (provider in ('moyasar')),
  mode                     text not null default 'test' check (mode in ('test', 'live')),
  -- Publishable key and anything else safe to read back in the console / send to the browser.
  public_config            jsonb not null default '{}'::jsonb check (jsonb_typeof(public_config) = 'object'),
  secret_vault_id          uuid,
  webhook_secret_vault_id  uuid,
  methods                  text[] not null default '{}',
  is_active                boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tenant_id, provider),
  unique (tenant_id, id)
);

create trigger payment_provider_configs_updated_at before update on public.payment_provider_configs
  for each row execute function app.set_updated_at();

alter table public.payment_provider_configs enable row level security;
grant select on public.payment_provider_configs to authenticated;
-- No insert/update/delete policies: configuration (and the secrets it references
-- in Vault) is only ever written through public.save_payment_provider() below.
create policy payment_provider_configs_read on public.payment_provider_configs for select to authenticated
  using (app.has_permission(tenant_id, 'settings.write') or app.is_super_admin());
create trigger audit_payment_provider_configs after insert or update on public.payment_provider_configs
  for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Orders / payments: add the online-payment path alongside pay-on-fulfillment
-- -----------------------------------------------------------------------------
alter table public.orders add column expires_at timestamptz;
alter table public.orders add column payment_intent_ref text;
create unique index orders_payment_intent_ref on public.orders (payment_intent_ref) where payment_intent_ref is not null;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('pending_payment', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'));

alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('pay_on_fulfillment', 'online'));

alter table public.payments add column provider_ref text;
alter table public.payments add column provider_event_id text;
create unique index payments_provider_event_unique on public.payments (provider, provider_event_id)
  where provider_event_id is not null;
create unique index payments_one_online_per_order on public.payments (order_id) where provider <> 'manual';

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('manual', 'moyasar'));

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check (method in
  ('cash', 'card_terminal', 'bank_transfer', 'card', 'mada', 'applepay', 'stcpay'));

create index orders_pending_payment_expiry on public.orders (expires_at) where status = 'pending_payment';

-- -----------------------------------------------------------------------------
-- Provider secrets (Vault-backed; service_role only, never sent to the browser)
-- -----------------------------------------------------------------------------

-- Creates/updates a tenant's provider config. Empty p_secret_key / p_webhook_secret
-- means "keep the current one" so the owner never has to re-enter a working key.
create or replace function public.save_payment_provider(
  p_tenant uuid, p_provider text, p_mode text, p_publishable_key text,
  p_secret_key text, p_webhook_secret text, p_methods text[], p_is_active boolean
)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  c public.payment_provider_configs%rowtype;
  v_secret_id uuid;
  v_webhook_id uuid;
begin
  if not app.has_permission(p_tenant, 'settings.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_provider not in ('moyasar') or p_mode not in ('test', 'live') then
    raise exception 'invalid_provider' using errcode = '22023';
  end if;
  if coalesce(length(p_publishable_key), 0) not between 1 and 200 then
    raise exception 'invalid_publishable_key' using errcode = '22023';
  end if;

  select * into c from public.payment_provider_configs where tenant_id = p_tenant and provider = p_provider;

  if nullif(btrim(p_secret_key), '') is not null then
    if c.secret_vault_id is not null then
      perform vault.update_secret(c.secret_vault_id, p_secret_key);
      v_secret_id := c.secret_vault_id;
    else
      v_secret_id := vault.create_secret(p_secret_key, p_tenant::text || ':' || p_provider || ':secret_key');
    end if;
  elsif c.id is null then
    raise exception 'secret_key_required' using errcode = '22023';
  else
    v_secret_id := c.secret_vault_id;
  end if;

  if nullif(btrim(p_webhook_secret), '') is not null then
    if c.webhook_secret_vault_id is not null then
      perform vault.update_secret(c.webhook_secret_vault_id, p_webhook_secret);
      v_webhook_id := c.webhook_secret_vault_id;
    else
      v_webhook_id := vault.create_secret(p_webhook_secret, p_tenant::text || ':' || p_provider || ':webhook_secret');
    end if;
  elsif c.id is null then
    raise exception 'webhook_secret_required' using errcode = '22023';
  else
    v_webhook_id := c.webhook_secret_vault_id;
  end if;

  insert into public.payment_provider_configs as pc
    (tenant_id, provider, mode, public_config, secret_vault_id, webhook_secret_vault_id, methods, is_active)
  values (p_tenant, p_provider, p_mode, jsonb_build_object('publishable_key', p_publishable_key),
          v_secret_id, v_webhook_id, coalesce(p_methods, '{}'), p_is_active)
  on conflict (tenant_id, provider) do update set
    mode = excluded.mode, public_config = excluded.public_config, secret_vault_id = excluded.secret_vault_id,
    webhook_secret_vault_id = excluded.webhook_secret_vault_id, methods = excluded.methods, is_active = excluded.is_active;
end;
$$;

revoke all on function public.save_payment_provider(uuid, text, text, text, text, text, text[], boolean) from public;
grant execute on function public.save_payment_provider(uuid, text, text, text, text, text, text[], boolean) to authenticated;

-- Decrypted secrets for an outbound provider call. service_role only — the app
-- calls this immediately before contacting the provider and never persists the result.
create or replace function public.payment_provider_secret(p_tenant uuid, p_provider text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('secret_key', s.decrypted_secret, 'webhook_secret', w.decrypted_secret,
                            'mode', c.mode, 'public_config', c.public_config, 'methods', c.methods)
  from public.payment_provider_configs c
  join vault.decrypted_secrets s on s.id = c.secret_vault_id
  join vault.decrypted_secrets w on w.id = c.webhook_secret_vault_id
  where c.tenant_id = p_tenant and c.provider = p_provider and c.is_active
$$;

revoke all on function public.payment_provider_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.payment_provider_secret(uuid, text) to service_role;

-- Safe (no secrets) read for the storefront checkout page.
create or replace function public.storefront_payment_options(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_build_object('available', true, 'provider', c.provider, 'methods', c.methods,
                    'publishable_key', c.public_config ->> 'publishable_key'),
                  jsonb_build_object('available', false, 'methods', '[]'::jsonb))
  from public.payment_provider_configs c
  where c.tenant_id = p_tenant and c.is_active
  limit 1
$$;

revoke all on function public.storefront_payment_options(uuid) from public, anon, authenticated;
grant execute on function public.storefront_payment_options(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Ordering can now open on either pay-on-fulfillment or an active online provider.
-- -----------------------------------------------------------------------------
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
    'online_payment', exists (select 1 from public.payment_provider_configs c
                              where c.tenant_id = p_tenant and c.is_active),
    'min_order_minor', (s.checkout ->> 'min_order_minor')::bigint,
    'tax_rate_bps', coalesce((s.tax ->> 'rate_bps')::integer, 0),
    'tax_included', coalesce((s.tax ->> 'included')::boolean, true),
    'tax_registration_number', nullif(btrim(s.tax ->> 'registration_number'), '')
  )
  from public.tenant_settings s
  where s.tenant_id = p_tenant
$$;

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
     or not (coalesce((s ->> 'pay_on_fulfillment')::boolean, false) or coalesce((s ->> 'online_payment')::boolean, false)) then
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

create or replace function public.storefront_checkout_options(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with s as (select app.commerce_settings(p_tenant) as v)
  select jsonb_build_object(
    'ordering_open', (s.v ->> 'accepting_orders')::boolean
                     and ((s.v ->> 'pay_on_fulfillment')::boolean or (s.v ->> 'online_payment')::boolean)
                     and app.tenant_has_feature(p_tenant, 'orders')
                     and ((s.v ->> 'pickup')::boolean
                          or ((s.v ->> 'delivery')::boolean and exists (select 1 from public.delivery_zones z where z.tenant_id = p_tenant and z.active))),
    'pickup', (s.v ->> 'pickup')::boolean,
    'delivery', (s.v ->> 'delivery')::boolean,
    'pay_on_fulfillment', (s.v ->> 'pay_on_fulfillment')::boolean,
    'online_payment', (s.v ->> 'online_payment')::boolean,
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

-- -----------------------------------------------------------------------------
-- create_order_from_cart: online orders are created pending_payment, held 15 minutes.
-- -----------------------------------------------------------------------------
create or replace function public.create_order_from_cart(p_tenant uuid, p_token_hash text, p_checkout jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_cart     uuid;
  v_quote    jsonb;
  v_settings jsonb;
  v_order    uuid;
  v_number   bigint;
  v_customer uuid;
  v_branch   uuid;
  v_currency char(3);
  v_zone     public.delivery_zones%rowtype;
  v_fulfill  text := p_checkout ->> 'fulfillment';
  v_zone_id  uuid;
  v_pay      text := coalesce(nullif(p_checkout ->> 'payment_method', ''), 'pay_on_fulfillment');
  v_status   text;
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
  if v_pay not in ('pay_on_fulfillment', 'online') then
    raise exception 'invalid_checkout' using errcode = '22023';
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

  v_settings := app.commerce_settings(p_tenant);
  if v_pay = 'online' and not coalesce((v_settings ->> 'online_payment')::boolean, false) then
    raise exception 'online_payment_unavailable' using errcode = '22023';
  end if;
  if v_pay = 'pay_on_fulfillment' and not coalesce((v_settings ->> 'pay_on_fulfillment')::boolean, false) then
    raise exception 'pay_on_fulfillment_unavailable' using errcode = '22023';
  end if;
  v_status := case when v_pay = 'online' then 'pending_payment' else 'pending' end;

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

  insert into public.orders (tenant_id, branch_id, customer_id, order_number, status, payment_method, fulfillment_type,
                             delivery_zone_id, delivery_zone_name, subtotal_minor, delivery_fee_minor, tax_minor,
                             total_minor, currency, tax_rate_bps, tax_included, contact, shipping_address, notes,
                             locale, access_token_hash, expires_at)
  values (p_tenant, v_branch, v_customer, v_number::text, v_status, v_pay, v_fulfill, v_zone.id, v_zone.name,
          (v_quote ->> 'subtotal_minor')::bigint, (v_quote ->> 'delivery_fee_minor')::bigint,
          (v_quote ->> 'tax_minor')::bigint, (v_quote ->> 'total_minor')::bigint, v_currency,
          (v_quote ->> 'tax_rate_bps')::integer, (v_quote ->> 'tax_included')::boolean,
          v_contact, v_address, nullif(btrim(p_checkout ->> 'notes'), ''), v_locale, p_checkout ->> 'access_token_hash',
          case when v_status = 'pending_payment' then now() + interval '15 minutes' end)
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
  values (p_tenant, v_order, null, v_status);

  update public.carts set status = 'converted', order_id = v_order, customer_id = v_customer, last_activity_at = now()
  where id = v_cart;

  return jsonb_build_object('order_id', v_order, 'order_number', v_number::text, 'total_minor', v_quote -> 'total_minor',
                            'status', v_status, 'payment_method', v_pay);
end;
$$;

-- Records where the browser should be sent to pay (server-code chooses the
-- reference after calling the provider; this just stores it on the order).
create or replace function public.set_payment_intent_ref(p_order uuid, p_ref text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  update public.orders set payment_intent_ref = p_ref
  where id = p_order and status = 'pending_payment' and payment_method = 'online' and payment_intent_ref is null;
  if not found then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.set_payment_intent_ref(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payment_intent_ref(uuid, text) to service_role;

-- The single, idempotent entry point for marking an online payment paid.
-- Called by both the customer's return page and the provider's webhook.
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

  return jsonb_build_object('result', 'confirmed', 'order_number', o.order_number, 'tenant_id', o.tenant_id);
end;
$$;

revoke all on function public.confirm_online_payment(text, text, boolean, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_online_payment(text, text, boolean, bigint, text, text, text) to service_role;

-- Cancels and releases stock for online orders whose 15-minute hold expired unpaid.
create or replace function app.expire_pending_payments()
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n integer := 0;
  o record;
  i record;
begin
  for o in select * from public.orders where status = 'pending_payment' and expires_at < now() for update skip locked loop
    for i in select * from public.order_items where order_id = o.id and inventory_item_id is not null and reserved_qty > 0 loop
      update public.inventory_items set reserved = greatest(reserved - i.reserved_qty, 0) where id = i.inventory_item_id;
      update public.order_items set reserved_qty = 0 where id = i.id;
    end loop;
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'payment_expired', expires_at = null
    where id = o.id;
    insert into public.order_status_history (tenant_id, order_id, from_status, to_status, note)
    values (o.tenant_id, o.id, 'pending_payment', 'cancelled', 'payment_expired');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function app.expire_pending_payments() from public;
grant execute on function app.expire_pending_payments() to service_role;

select cron.schedule('expire-pending-payments', '* * * * *', $$select app.expire_pending_payments()$$);

-- allowed_next_statuses: an unpaid online order can only be cancelled (never
-- hand-advanced past payment); everything else is unchanged from Phase 5.
create or replace function app.allowed_next_statuses(p_status text, p_fulfillment text)
returns text[]
language sql immutable
set search_path = ''
as $$
  select case p_status
    when 'pending_payment' then array['cancelled']
    when 'pending' then array['confirmed', 'cancelled']
    when 'confirmed' then array['preparing', case when p_fulfillment = 'delivery' then 'out_for_delivery' else 'ready' end, 'completed', 'cancelled']
    when 'preparing' then array[case when p_fulfillment = 'delivery' then 'out_for_delivery' else 'ready' end, 'completed', 'cancelled']
    when 'ready' then array['completed', 'cancelled']
    when 'out_for_delivery' then array['completed', 'cancelled']
    else array[]::text[]
  end
$$;

-- storefront_order: also exposes what the payment-resume route needs for a
-- still-unpaid online order (its id, provider reference and hold expiry).
-- Still keyed on the same order number + private token; nothing new is guessable.
create or replace function public.storefront_order(p_tenant uuid, p_number text, p_token_hash text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
    'payment_method', o.payment_method, 'payment_intent_ref', o.payment_intent_ref, 'expires_at', o.expires_at,
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

do $$
begin
  execute 'revoke all on function public.storefront_checkout_options(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.storefront_checkout_options(uuid) to service_role';
  execute 'revoke all on function public.create_order_from_cart(uuid, text, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.create_order_from_cart(uuid, text, jsonb) to service_role';
end;
$$;
