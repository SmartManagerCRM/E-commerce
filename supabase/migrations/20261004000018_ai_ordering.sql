-- =============================================================================
-- 0018 · AI Operating System — Phase 2 (ordering assistant)
--
-- Extends the existing guest-checkout path (app.quote / create_order_from_cart)
-- to support dine-in, and adds the two guest-safe table functions the AI
-- needs to identify and open a table session for a customer who has no staff
-- session at all — mirroring the guest-checkout/guest-booking security
-- pattern (service_role-only, tenant resolved server-side, nothing the
-- browser supplies is trusted without validation).
--
-- THE INVARIANT THIS MIGRATION MUST NOT WEAKEN (already true before this
-- migration, from Phase 7's `orders_check` constraint):
--
--   fulfillment_type = 'dine_in'  =>  table_session_id IS NOT NULL
--
-- That CHECK constraint on `orders` already makes it impossible to insert a
-- dine-in order without a table session at the database level, regardless of
-- what any application code (AI included) does or doesn't check. This
-- migration's job is just to let a *guest* reach that same, already-enforced
-- path — not to add the enforcement, which was never missing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.quote(): dine-in is a third fulfillment type — no delivery fee, no
-- zone, available whenever ordering is accepting at all.
-- -----------------------------------------------------------------------------
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
  elsif p_fulfillment = 'dine_in' then
    null; -- always available once ordering itself is open; no fee, no zone.
  else
    v_problems := array_append(v_problems, 'fulfillment_unavailable');
  end if;

  if (s ->> 'min_order_minor') is not null and v_subtotal < (s ->> 'min_order_minor')::bigint then
    v_problems := array_append(v_problems, 'below_minimum');
  end if;

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

-- -----------------------------------------------------------------------------
-- create_order_from_cart(): dine-in branch. Same pricing/stock-reservation
-- path as pickup/delivery; the only new things are (a) the branch comes from
-- the table session, not the tenant's default branch, and (b) contact is
-- optional (the existing orders_contact_check constraint already allows a
-- null contact only for dine_in — this is the first caller to exercise it
-- from a guest context; create_dine_in_order, Phase 7's staff path, always
-- passes null).
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
  v_session  uuid;
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
  if v_fulfill = 'dine_in' then
    v_session := nullif(p_checkout ->> 'table_session_id', '')::uuid;
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

  if v_fulfill = 'dine_in' then
    -- THE GATE: no open, tenant-owned table session, no order. Locking it
    -- here also prevents a second guest at the same table from racing this
    -- one to create two orders off a session that's about to close.
    select ts.branch_id into v_branch
    from public.table_sessions ts
    where ts.tenant_id = p_tenant and ts.id = v_session and ts.status = 'open'
    for update;
    if v_branch is null then
      raise exception 'table_required' using errcode = '22023';
    end if;
    -- Contact is optional for dine-in (the customer is physically present);
    -- collected only if the assistant asked for it, e.g. to attach loyalty.
    if coalesce(length(btrim(p_checkout #>> '{contact,email}')), 0) > 0 then
      v_contact := jsonb_build_object(
        'name', nullif(btrim(p_checkout #>> '{contact,name}'), ''),
        'email', lower(btrim(p_checkout #>> '{contact,email}')),
        'phone', nullif(btrim(p_checkout #>> '{contact,phone}'), ''));
      if (v_contact ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_contact ->> 'email') > 254
         or ((v_contact ->> 'phone') is not null and (v_contact ->> 'phone') !~ '^\+?[0-9 ()-]{6,24}$') then
        raise exception 'invalid_contact' using errcode = '22023';
      end if;
    else
      v_contact := null;
    end if;
  else
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
    select b.id into v_branch from public.branches b where b.tenant_id = p_tenant and b.is_default;
  end if;

  if length(coalesce(p_checkout ->> 'notes', '')) > 1000 or v_locale not in ('en', 'fr', 'ar')
     or coalesce(p_checkout ->> 'access_token_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_checkout' using errcode = '22023';
  end if;

  select t.currency into v_currency from public.tenants t where t.id = p_tenant;

  -- Customer: one per email; details refreshed from the latest order. A
  -- dine-in order with no contact given at all (the common case) has none.
  if v_contact is not null then
    insert into public.customers as c (tenant_id, email, phone, full_name, locale, marketing_consent, consent_at,
                                       first_order_at, last_order_at, orders_count)
    values (p_tenant, v_contact ->> 'email', v_contact ->> 'phone', coalesce(v_contact ->> 'name', ''), v_locale,
            v_consent, case when v_consent then now() end, now(), now(), 1)
    on conflict (tenant_id, email) do update set
      full_name = case when excluded.full_name <> '' then excluded.full_name else c.full_name end,
      phone = coalesce(excluded.phone, c.phone),
      locale = excluded.locale,
      marketing_consent = c.marketing_consent or excluded.marketing_consent,
      consent_at = case when not c.marketing_consent and excluded.marketing_consent then now() else c.consent_at end,
      last_order_at = now(),
      orders_count = c.orders_count + 1
    returning id into v_customer;
  else
    v_customer := null;
  end if;

  v_number := app.next_counter(p_tenant, 'order_number', 1001);

  insert into public.orders (tenant_id, branch_id, customer_id, order_number, status, payment_method, fulfillment_type,
                             table_session_id, delivery_zone_id, delivery_zone_name, subtotal_minor, delivery_fee_minor,
                             tax_minor, total_minor, currency, tax_rate_bps, tax_included, contact, shipping_address,
                             notes, locale, access_token_hash, expires_at)
  values (p_tenant, v_branch, v_customer, v_number::text, v_status, v_pay, v_fulfill, v_session, v_zone.id, v_zone.name,
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

-- -----------------------------------------------------------------------------
-- Guest table identification/session — the same "service_role only, tenant
-- resolved from the request Host header, nothing from the browser trusted
-- without validation" pattern as guest checkout and guest booking.
-- -----------------------------------------------------------------------------

-- Finds a table by its customer-facing label (what a QR code or a spoken
-- "table 12" resolves to). Returns nothing beyond what's safe to show a guest.
create or replace function public.storefront_find_table(p_tenant uuid, p_label text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', t.id, 'label', t.label, 'capacity', t.capacity)
  from public.tables t
  where t.tenant_id = p_tenant and t.active and lower(btrim(t.label)) = lower(btrim(p_label))
  limit 1
$$;

revoke all on function public.storefront_find_table(uuid, text) from public, anon, authenticated;
grant execute on function public.storefront_find_table(uuid, text) to service_role;

-- Opens a session for a guest sitting at a table (or returns the one already
-- open there, so a second person at the same table joins the same session
-- instead of racing to create a duplicate). The table itself is validated
-- (exists, belongs to this tenant, active) — a guest can never open a session
-- against another tenant's table or a table id that doesn't exist.
create or replace function public.storefront_open_table_session(p_tenant uuid, p_table uuid)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_branch  uuid;
  v_session uuid;
begin
  select branch_id into v_branch from public.tables where tenant_id = p_tenant and id = p_table and active;
  if v_branch is null then
    raise exception 'invalid_table' using errcode = '22023';
  end if;

  select id into v_session from public.table_sessions
  where tenant_id = p_tenant and table_id = p_table and status = 'open';
  if v_session is not null then
    return v_session;
  end if;

  insert into public.table_sessions (tenant_id, branch_id, table_id)
  values (p_tenant, v_branch, p_table)
  returning id into v_session;
  update public.tables set status = 'occupied' where tenant_id = p_tenant and id = p_table;
  return v_session;
end;
$$;

revoke all on function public.storefront_open_table_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.storefront_open_table_session(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- The AI's working memory for one ordering conversation: which cart, which
-- fulfillment type, and — the whole point — which table session, so the
-- "create order" tool can refuse to run without one already resolved.
-- -----------------------------------------------------------------------------
alter table public.ai_conversations
  add column cart_token_hash text,
  add column fulfillment_type text check (fulfillment_type is null or fulfillment_type in ('pickup', 'delivery', 'dine_in')),
  add column table_session_id uuid,
  add column delivery_zone_id uuid;

alter table public.ai_conversations
  add constraint ai_conversations_table_session_fkey
    foreign key (tenant_id, table_session_id) references public.table_sessions (tenant_id, id) on delete set null (table_session_id),
  add constraint ai_conversations_delivery_zone_fkey
    foreign key (tenant_id, delivery_zone_id) references public.delivery_zones (tenant_id, id) on delete set null (delivery_zone_id);
