-- =============================================================================
-- 0014 · Dine-in foundation (branches → tables → table_sessions → orders → order_items)
--
--   branches ─< tables ─< table_sessions ─< orders ─< order_items
--
-- This gives the app (and, later, an AI agent calling the same server-side
-- service layer — never the database directly) a real concept of a physical
-- table and a seated visit, so a café/restaurant tenant can take orders at
-- the table the same way the storefront takes them online: server-computed
-- pricing, reserved stock, one workflow (`app.allowed_next_statuses`) and
-- one order_status_history — `orders.table_session_id` and
-- `fulfillment_type = 'dine_in'` are the only additions to the order model
-- itself. No console UI ships with this migration yet (see ARCHITECTURE.md);
-- this is the schema + RPC foundation the AI layer and the eventual POS UI
-- both build on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables (physical tables/areas at a branch)
-- -----------------------------------------------------------------------------
create table public.tables (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  branch_id  uuid not null,
  label      text not null check (length(btrim(label)) between 1 and 40),
  capacity   integer check (capacity is null or capacity between 1 and 100),
  status     text not null default 'available' check (status in ('available', 'occupied', 'reserved', 'inactive')),
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, branch_id, label),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade
);

create index tables_tenant_branch on public.tables (tenant_id, branch_id, position);
create trigger tables_updated_at before update on public.tables for each row execute function app.set_updated_at();

alter table public.tables enable row level security;
grant select, insert, update, delete on public.tables to authenticated;
create policy tables_read on public.tables for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
create policy tables_write on public.tables for insert to authenticated
  with check (app.has_permission(tenant_id, 'orders.write'));
create policy tables_update on public.tables for update to authenticated
  using (app.has_permission(tenant_id, 'orders.write')) with check (app.has_permission(tenant_id, 'orders.write'));
create policy tables_delete on public.tables for delete to authenticated
  using (app.has_permission(tenant_id, 'orders.write'));
create trigger audit_tables after insert or update or delete on public.tables for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Table sessions (one seated visit; may carry several orders — "rounds")
-- -----------------------------------------------------------------------------
create table public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  branch_id     uuid not null,
  table_id      uuid not null,
  status        text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  party_size    integer check (party_size is null or party_size between 1 and 100),
  opened_by     uuid,
  notes         text check (notes is null or length(notes) <= 500),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade,
  foreign key (tenant_id, table_id) references public.tables (tenant_id, id) on delete cascade
);

-- A table can only be in one open session at a time.
create unique index table_sessions_one_open_per_table on public.table_sessions (tenant_id, table_id) where status = 'open';
create index table_sessions_tenant_status on public.table_sessions (tenant_id, status, opened_at desc);

alter table public.table_sessions enable row level security;
grant select on public.table_sessions to authenticated;
create policy table_sessions_read on public.table_sessions for select to authenticated
  using (app.has_permission(tenant_id, 'orders.read') or app.is_super_admin());
-- No direct insert/update/delete policies: the lifecycle functions below
-- (which also flip the table's status) are the only way to open or close one.
create trigger audit_table_sessions after insert or update on public.table_sessions for each row execute function app.audit_row_change();

-- -----------------------------------------------------------------------------
-- Orders: dine-in joins the existing pickup/delivery/online model
-- -----------------------------------------------------------------------------
alter table public.orders add column table_session_id uuid;
alter table public.orders add constraint orders_table_session_fk
  foreign key (tenant_id, table_session_id) references public.table_sessions (tenant_id, id) on delete set null (table_session_id);
create index orders_table_session on public.orders (table_session_id) where table_session_id is not null;

alter table public.orders drop constraint orders_fulfillment_type_check;
alter table public.orders add constraint orders_fulfillment_type_check check (fulfillment_type in ('pickup', 'delivery', 'dine_in'));

alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_check check (
  (fulfillment_type = 'pickup')
  or (fulfillment_type = 'delivery' and shipping_address is not null)
  or (fulfillment_type = 'dine_in' and table_session_id is not null)
);

-- Contact is optional for a dine-in order placed by staff at the table (no
-- guest checkout form to fill in); every other fulfillment still requires one.
alter table public.orders alter column contact drop not null;
alter table public.orders drop constraint orders_contact_check;
alter table public.orders add constraint orders_contact_check check (
  (fulfillment_type = 'dine_in' and (contact is null or jsonb_typeof(contact) = 'object'))
  or (fulfillment_type <> 'dine_in' and contact is not null and jsonb_typeof(contact) = 'object')
);

-- -----------------------------------------------------------------------------
-- Table lifecycle (staff-facing; orders.write)
-- -----------------------------------------------------------------------------
create or replace function public.create_table(p_tenant uuid, p_branch uuid, p_label text, p_capacity integer default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_permission(p_tenant, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.tables (tenant_id, branch_id, label, capacity)
  values (p_tenant, p_branch, p_label, p_capacity)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_table(uuid, uuid, text, integer) from public, anon;
grant execute on function public.create_table(uuid, uuid, text, integer) to authenticated;

-- Opens a new seated visit at a table. The table must be free (no open session already).
create or replace function public.open_table_session(p_tenant uuid, p_table uuid, p_party_size integer default null, p_notes text default null)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_branch  uuid;
begin
  if not app.has_permission(p_tenant, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select branch_id into v_branch from public.tables where tenant_id = p_tenant and id = p_table and active;
  if v_branch is null then
    raise exception 'invalid_table' using errcode = '22023';
  end if;
  if exists (select 1 from public.table_sessions where tenant_id = p_tenant and table_id = p_table and status = 'open') then
    raise exception 'table_occupied' using errcode = '22023';
  end if;

  insert into public.table_sessions (tenant_id, branch_id, table_id, party_size, opened_by, notes)
  values (p_tenant, v_branch, p_table, p_party_size, (select auth.uid()), nullif(btrim(p_notes), ''))
  returning id into v_session;
  update public.tables set status = 'occupied' where tenant_id = p_tenant and id = p_table;
  return v_session;
end;
$$;

revoke all on function public.open_table_session(uuid, uuid, integer, text) from public, anon;
grant execute on function public.open_table_session(uuid, uuid, integer, text) to authenticated;

-- Closes a table session once every order on it is settled (paid or cancelled).
create or replace function public.close_table_session(p_tenant uuid, p_session uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  s public.table_sessions%rowtype;
begin
  if not app.has_permission(p_tenant, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from public.table_sessions where tenant_id = p_tenant and id = p_session for update;
  if not found or s.status <> 'open' then
    raise exception 'invalid_session' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders o where o.table_session_id = p_session
             and o.status not in ('completed', 'cancelled')) then
    raise exception 'open_orders_remaining' using errcode = '22023';
  end if;

  update public.table_sessions set status = 'closed', closed_at = now() where tenant_id = p_tenant and id = p_session;
  update public.tables set status = 'available' where tenant_id = p_tenant and id = s.table_id;
end;
$$;

revoke all on function public.close_table_session(uuid, uuid) from public, anon;
grant execute on function public.close_table_session(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Dine-in orders: staff builds the order directly (no guest cart/checkout —
-- there's no browser on the other end). Same pricing/stock invariants as the
-- storefront: nothing is trusted from the caller except which variants and
-- quantities were ordered; price, tax and stock are computed and checked here.
--   p_items = [{ "variant_id": uuid, "qty": int }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.create_dine_in_order(p_tenant uuid, p_session uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  s          public.table_sessions%rowtype;
  settings   jsonb;
  v_rate     integer;
  v_included boolean;
  v_subtotal bigint := 0;
  v_tax      bigint := 0;
  v_number   bigint;
  v_order    uuid;
  v_currency char(3);
  item       record;
  v          public.product_variants%rowtype;
  p          public.products%rowtype;
  inv        public.inventory_items%rowtype;
  v_pos      integer := 0;
  v_line_total bigint;
begin
  if not app.has_permission(p_tenant, 'orders.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;

  select * into s from public.table_sessions where tenant_id = p_tenant and id = p_session for update;
  if not found or s.status <> 'open' then
    raise exception 'invalid_session' using errcode = '22023';
  end if;

  settings := app.commerce_settings(p_tenant);
  v_rate := coalesce((settings ->> 'tax_rate_bps')::integer, 0);
  v_included := coalesce((settings ->> 'tax_included')::boolean, true);
  select t.currency into v_currency from public.tenants t where t.id = p_tenant;

  -- Lock every referenced inventory row up front, in a stable order, before pricing.
  perform 1 from public.inventory_items i
  join public.product_variants pv on pv.id = i.variant_id
  where i.tenant_id = p_tenant and i.branch_id = s.branch_id
    and pv.id in (select (e ->> 'variant_id')::uuid from jsonb_array_elements(p_items) e)
  order by i.id for update;

  v_number := app.next_counter(p_tenant, 'order_number', 1001);
  -- access_token_hash has no real customer-tracking use for a dine-in order (there is
  -- no guest session to hand a link to); it's a random placeholder purely to satisfy
  -- the shared not-null/format constraint every order row carries.
  insert into public.orders (tenant_id, branch_id, order_number, status, payment_method, fulfillment_type,
                             table_session_id, subtotal_minor, tax_minor, total_minor, currency,
                             tax_rate_bps, tax_included, contact, notes, locale, access_token_hash)
  values (p_tenant, s.branch_id, v_number::text, 'pending', 'pay_on_fulfillment', 'dine_in', p_session,
          0, 0, 0, v_currency, v_rate, v_included, null, nullif(btrim(p_notes), ''), 'en',
          encode(sha256(gen_random_uuid()::text::bytea), 'hex'))
  returning id into v_order;

  for item in select (e ->> 'variant_id')::uuid as variant_id, (e ->> 'qty')::integer as qty
              from jsonb_array_elements(p_items) e
  loop
    if item.qty is null or item.qty < 1 or item.qty > 99 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    select * into v from public.product_variants where id = item.variant_id and tenant_id = p_tenant;
    if v.id is null or v.status <> 'active' then
      raise exception 'unavailable' using errcode = '22023';
    end if;
    select * into p from public.products where id = v.product_id and status = 'active';
    if p.id is null then
      raise exception 'unavailable' using errcode = '22023';
    end if;
    select * into inv from public.inventory_items where variant_id = v.id and branch_id = s.branch_id;
    if inv.id is not null and inv.track_stock and not inv.allow_backorder
       and inv.on_hand - inv.reserved < item.qty then
      raise exception 'insufficient_stock' using errcode = '22023';
    end if;

    v_line_total := v.price_minor * item.qty;
    v_subtotal := v_subtotal + v_line_total;
    insert into public.order_items (tenant_id, order_id, variant_id, product_id, inventory_item_id, reserved_qty,
                                    snapshot, unit_price_minor, qty, total_minor, position)
    values (p_tenant, v_order, v.id, p.id, inv.id, case when inv.id is not null and inv.track_stock then item.qty else 0 end,
            jsonb_build_object('name', p.name, 'slug', p.slug, 'sku', v.sku), v.price_minor, item.qty, v_line_total, v_pos);
    if inv.id is not null and inv.track_stock then
      update public.inventory_items set reserved = reserved + item.qty where id = inv.id;
    end if;
    v_pos := v_pos + 1;
  end loop;

  if v_rate > 0 then
    v_tax := case when v_included then app.div_round(v_subtotal * v_rate, 10000 + v_rate)
                  else app.div_round(v_subtotal * v_rate, 10000) end;
  end if;

  update public.orders set subtotal_minor = v_subtotal, tax_minor = v_tax,
    total_minor = v_subtotal + case when v_included then 0 else v_tax end
  where id = v_order;

  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_id)
  values (p_tenant, v_order, null, 'pending', (select auth.uid()));

  return jsonb_build_object('order_id', v_order, 'order_number', v_number::text,
                            'total_minor', v_subtotal + case when v_included then 0 else v_tax end);
end;
$$;

revoke all on function public.create_dine_in_order(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.create_dine_in_order(uuid, uuid, jsonb, text) to authenticated;
