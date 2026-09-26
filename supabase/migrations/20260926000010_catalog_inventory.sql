-- =============================================================================
-- 0010 · Phase 4 — catalog & inventory
--
--   categories ─┬─< product_categories >─┬─ products ─┬─< product_options ─< product_option_values
--               │                        │            ├─< product_variants ─< inventory_items ─< stock_movements
--               └─ parent (tree)         │            └─< product_images
--
-- * Every table carries tenant_id and uses composite (tenant_id, id) foreign
--   keys, so rows can never be linked across tenants — even by privileged code.
-- * Prices are bigint minor units. Cost and stock live only in inventory
--   tables, which anonymous visitors can never read.
-- * Stock changes only through app functions that write an audit trail
--   (stock_movements); on_hand is never updated directly by clients.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Search normalisation (Latin accents + Arabic diacritics/letter variants)
-- -----------------------------------------------------------------------------
create or replace function app.normalize_search(value text)
returns text
language sql stable parallel safe
set search_path = ''
as $$
  select lower(
    translate(
      regexp_replace(extensions.unaccent(coalesce(value, '')), '[ً-ٰٟـ]', '', 'g'),
      'أإآىة', 'ااايه'
    )
  )
$$;

grant execute on function app.normalize_search(text) to anon, authenticated, service_role;

create or replace function app.localized_values(value jsonb)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(v, ' '), '') from jsonb_each_text(coalesce(value, '{}'::jsonb)) as e(k, v)
$$;

-- -----------------------------------------------------------------------------
-- Categories (tree)
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  parent_id   uuid,
  name        jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  slug        text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  description jsonb not null default '{}'::jsonb check (app.is_localized_text(description)),
  image_path  text,
  position    integer not null default 0,
  status      text not null default 'active' check (status in ('active', 'hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  foreign key (tenant_id, parent_id) references public.categories (tenant_id, id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id)
);

create index categories_tenant_position on public.categories (tenant_id, parent_id, position);

create trigger categories_updated_at before update on public.categories
  for each row execute function app.set_updated_at();

-- No cycles in the category tree.
create or replace function app.guard_category_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    with recursive ancestors(id) as (
      select new.parent_id
      union
      select c.parent_id from public.categories c join ancestors a on c.id = a.id where c.parent_id is not null
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A category cannot be placed inside itself' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_guard_cycle before insert or update of parent_id on public.categories
  for each row execute function app.guard_category_cycle();

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  name           jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  slug           text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'),
  description    jsonb not null default '{}'::jsonb check (app.is_localized_text(description)),
  subtitle       jsonb not null default '{}'::jsonb check (app.is_localized_text(subtitle)),
  status         text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  featured       boolean not null default false,
  position       integer not null default 0,
  -- Denormalised for fast storefront filtering/sorting (maintained by triggers).
  price_min_minor bigint,
  price_max_minor bigint,
  search_text    text not null default '',
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);

create index products_tenant_status on public.products (tenant_id, status, featured desc, position, created_at desc);
create index products_tenant_price on public.products (tenant_id, status, price_min_minor);
create index products_search on public.products using gin (search_text extensions.gin_trgm_ops);

create trigger products_updated_at before update on public.products
  for each row execute function app.set_updated_at();

create or replace function app.products_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') and new.published_at is null then
    new.published_at := now();
  end if;
  new.search_text := app.normalize_search(
    app.localized_values(new.name) || ' ' || app.localized_values(new.subtitle) || ' ' || new.slug || ' ' ||
    coalesce((select string_agg(v.sku, ' ') from public.product_variants v where v.product_id = new.id), '')
  );
  return new;
end;
$$;

-- Plan limit: max_products (active + draft; archived products do not count).
create or replace function app.guard_product_limit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit integer := app.tenant_feature_limit(new.tenant_id, 'max_products');
begin
  if v_limit is not null
     and (select count(*) from public.products p where p.tenant_id = new.tenant_id and p.status <> 'archived') >= v_limit then
    raise exception 'Product limit of your plan reached' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger products_guard_limit before insert on public.products
  for each row execute function app.guard_product_limit();

create table public.product_categories (
  tenant_id   uuid not null,
  product_id  uuid not null,
  category_id uuid not null,
  position    integer not null default 0,
  primary key (product_id, category_id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id) on delete cascade
);

create index product_categories_category on public.product_categories (tenant_id, category_id, position);

-- -----------------------------------------------------------------------------
-- Options (e.g. Size) and values (250g, 500g, 1kg) — up to 3 options.
-- -----------------------------------------------------------------------------
create table public.product_options (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  product_id uuid not null,
  name       jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  position   smallint not null default 0 check (position between 0 and 2),
  unique (tenant_id, id),
  unique (product_id, position),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

create table public.product_option_values (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  option_id uuid not null,
  label     jsonb not null check (app.is_localized_text(label) and label <> '{}'::jsonb),
  position  integer not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, option_id) references public.product_options (tenant_id, id) on delete cascade
);

create index product_option_values_option on public.product_option_values (option_id, position);

-- -----------------------------------------------------------------------------
-- Images (files in storage: tenant-public/<tenant>/products/<uuid>.webp)
-- -----------------------------------------------------------------------------
create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  product_id   uuid not null,
  storage_path text not null check (storage_path ~ '^[0-9a-f-]{36}/products/[\w-]+\.(webp|jpg|png)$'),
  width        integer not null check (width > 0),
  height       integer not null check (height > 0),
  alt          jsonb not null default '{}'::jsonb check (app.is_localized_text(alt)),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  -- The file must live in the product's own tenant folder.
  check (split_part(storage_path, '/', 1) = tenant_id::text)
);

create index product_images_product on public.product_images (product_id, position);

-- -----------------------------------------------------------------------------
-- Variants (every product has at least one; price and SKU live here)
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  product_id       uuid not null,
  sku              text check (sku is null or sku ~ '^[A-Za-z0-9._/-]{1,64}$'),
  option_value_ids uuid[] not null default '{}',
  price_minor      bigint not null check (price_minor >= 0),
  compare_at_minor bigint check (compare_at_minor is null or compare_at_minor >= 0),
  weight_g         integer check (weight_g is null or weight_g >= 0),
  image_id         uuid,
  status           text not null default 'active' check (status in ('active', 'archived')),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, image_id) references public.product_images (tenant_id, id) on delete set null (image_id)
);

create unique index product_variants_sku on public.product_variants (tenant_id, lower(sku)) where sku is not null;
create unique index product_variants_combination on public.product_variants (product_id, option_value_ids) where status = 'active';
create index product_variants_product on public.product_variants (product_id, position);

create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function app.set_updated_at();

-- Keep the product's price range and search text in sync with its variants.
create or replace function app.sync_product_from_variants()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    price_min_minor = (select min(v.price_minor) from public.product_variants v where v.product_id = v_product and v.status = 'active'),
    price_max_minor = (select max(v.price_minor) from public.product_variants v where v.product_id = v_product and v.status = 'active')
  where p.id = v_product;
  return null;
end;
$$;

create trigger product_variants_sync after insert or update or delete on public.product_variants
  for each row execute function app.sync_product_from_variants();

create trigger products_before_write before insert or update on public.products
  for each row execute function app.products_before_write();

-- Option values used by a variant must belong to the same product.
create or replace function app.guard_variant_options()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.option_value_ids) as ov(id)
    where not exists (
      select 1 from public.product_option_values v
      join public.product_options o on o.id = v.option_id
      where v.id = ov.id and o.product_id = new.product_id
    )
  ) then
    raise exception 'Option values do not belong to this product' using errcode = '23503';
  end if;
  if new.image_id is not null and not exists (
    select 1 from public.product_images i where i.id = new.image_id and i.product_id = new.product_id
  ) then
    raise exception 'Image does not belong to this product' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger product_variants_guard before insert or update of option_value_ids, image_id on public.product_variants
  for each row execute function app.guard_variant_options();

-- -----------------------------------------------------------------------------
-- Inventory: one row per variant per branch. cost_minor lives here (never in
-- publicly readable tables). on_hand changes only through adjust_stock().
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  variant_id      uuid not null,
  branch_id       uuid not null,
  on_hand         integer not null default 0,
  reserved        integer not null default 0 check (reserved >= 0),
  min_stock       integer not null default 0 check (min_stock >= 0),
  cost_minor      bigint check (cost_minor is null or cost_minor >= 0),
  track_stock     boolean not null default false,
  allow_backorder boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (variant_id, branch_id),
  foreign key (tenant_id, variant_id) references public.product_variants (tenant_id, id) on delete cascade,
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade,
  check (on_hand >= 0 or allow_backorder)
);

create index inventory_items_tenant on public.inventory_items (tenant_id, branch_id);

create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function app.set_updated_at();

create table public.stock_movements (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null,
  inventory_item_id uuid not null,
  delta             integer not null check (delta <> 0),
  on_hand_after     integer not null,
  reason            text not null check (reason in ('initial', 'restock', 'adjustment', 'damage', 'correction',
                                                     'sale', 'refund', 'reservation_commit', 'transfer')),
  note              text check (note is null or length(note) <= 500),
  actor_user_id     uuid,
  order_id          uuid,
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, inventory_item_id) references public.inventory_items (tenant_id, id) on delete cascade
);

create index stock_movements_item on public.stock_movements (inventory_item_id, created_at desc);
create index stock_movements_tenant on public.stock_movements (tenant_id, created_at desc);

-- Every new variant gets an inventory row in the tenant's default branch.
-- Stock is tracked by default only when the tenant has the inventory module.
create or replace function app.create_variant_inventory()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.inventory_items (tenant_id, variant_id, branch_id, track_stock)
  select new.tenant_id, new.id, b.id, app.tenant_has_feature(new.tenant_id, 'inventory')
  from public.branches b
  where b.tenant_id = new.tenant_id and b.is_default
  on conflict (variant_id, branch_id) do nothing;
  return new;
end;
$$;

create trigger product_variants_inventory after insert on public.product_variants
  for each row execute function app.create_variant_inventory();

-- Audited stock change. Staff call it with inventory.write; sales/refunds
-- (Phase 5+) call it from server code with the service role.
create or replace function public.adjust_stock(p_item uuid, p_delta integer, p_reason text, p_note text default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.inventory_items%rowtype;
  v_after integer;
  -- current_user is the function owner inside SECURITY DEFINER; the caller's
  -- API role comes from the JWT.
  v_service boolean := coalesce((select auth.role()), '') = 'service_role';
begin
  select * into item from public.inventory_items where id = p_item for update;
  if not found then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;
  if not v_service and not app.has_permission(item.tenant_id, 'inventory.write') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_delta = 0 then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  if not v_service and p_reason not in ('initial', 'restock', 'adjustment', 'damage', 'correction') then
    raise exception 'Reason not allowed for manual changes' using errcode = '22023';
  end if;
  if item.on_hand + p_delta < 0 and not item.allow_backorder then
    raise exception 'Stock cannot go below zero' using errcode = '23514';
  end if;

  update public.inventory_items set on_hand = on_hand + p_delta where id = p_item returning on_hand into v_after;
  insert into public.stock_movements (tenant_id, inventory_item_id, delta, on_hand_after, reason, note, actor_user_id)
  values (item.tenant_id, p_item, p_delta, v_after, p_reason, nullif(btrim(p_note), ''), (select auth.uid()));
  return v_after;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text, text) from public;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated, service_role;

-- Availability derived from inventory (no quantities exposed).
create or replace function app.variant_availability(i public.inventory_items)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when i.id is null or not i.track_stock or i.allow_backorder then 'in_stock'
    when i.on_hand - i.reserved <= 0 then 'out_of_stock'
    when i.min_stock > 0 and i.on_hand - i.reserved <= i.min_stock then 'low_stock'
    else 'in_stock'
  end
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_categories    enable row level security;
alter table public.product_options       enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_images        enable row level security;
alter table public.product_variants      enable row level security;
alter table public.inventory_items       enable row level security;
alter table public.stock_movements       enable row level security;

-- Catalog tables: staff read/write by permission. Anonymous storefront
-- access goes through the storefront_* functions below, not these tables.
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'products', 'product_categories', 'product_options',
                           'product_option_values', 'product_images', 'product_variants'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy %1$s_read on public.%1$I for select to authenticated
      using (app.has_permission(tenant_id, 'catalog.read') or app.is_super_admin())$p$, t);
    execute format($p$create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (app.has_permission(tenant_id, 'catalog.write'))$p$, t);
    execute format($p$create policy %1$s_update on public.%1$I for update to authenticated
      using (app.has_permission(tenant_id, 'catalog.write')) with check (app.has_permission(tenant_id, 'catalog.write'))$p$, t);
    execute format($p$create policy %1$s_delete on public.%1$I for delete to authenticated
      using (app.has_permission(tenant_id, 'catalog.write'))$p$, t);
  end loop;
end;
$$;

-- search_text / price range / published_at are maintained by triggers only, and
-- tenant_id / id never change after insert. A column-level REVOKE does not
-- override a table-level GRANT, so products get explicit column grants instead.
revoke insert, update on public.products from authenticated;
grant insert (id, tenant_id, name, slug, description, subtitle, status, featured, position) on public.products to authenticated;
grant update (name, slug, description, subtitle, status, featured, position) on public.products to authenticated;

-- Inventory: readable with inventory.read (or catalog.read for availability
-- in the product editor); settings editable with inventory.write; quantities
-- only through adjust_stock().
grant select on public.inventory_items to authenticated;
grant update (min_stock, cost_minor, track_stock, allow_backorder) on public.inventory_items to authenticated;
create policy inventory_items_read on public.inventory_items for select to authenticated
  using (app.has_permission(tenant_id, 'inventory.read') or app.has_permission(tenant_id, 'catalog.write') or app.is_super_admin());
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.write')) with check (app.has_permission(tenant_id, 'inventory.write'));

grant select on public.stock_movements to authenticated;
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (app.has_permission(tenant_id, 'inventory.read') or app.is_super_admin());

-- Audit catalog structure changes (stock has its own ledger).
create trigger audit_categories after insert or update or delete on public.categories for each row execute function app.audit_row_change();
create trigger audit_products after insert or update or delete on public.products for each row execute function app.audit_row_change();
create trigger audit_product_variants after insert or update or delete on public.product_variants for each row execute function app.audit_row_change();
create trigger audit_inventory_settings after update of min_stock, cost_minor, track_stock, allow_backorder on public.inventory_items
  for each row execute function app.audit_row_change();

-- =============================================================================
-- Storefront read functions (anon). Only active products of active tenants,
-- only public fields, availability as a status (never quantities or cost).
-- =============================================================================

-- Product card payload for a set of products (shared by list functions).
create or replace function app.product_cards(p_ids uuid[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(card order by ord), '[]'::jsonb)
  from (
    select ids.ord, jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'subtitle', p.subtitle,
      'featured', p.featured,
      'created_at', p.created_at,
      'price_min', p.price_min_minor,
      'price_max', p.price_max_minor,
      'compare_at', (select v.compare_at_minor from public.product_variants v
                      where v.product_id = p.id and v.status = 'active' and v.price_minor = p.price_min_minor
                      order by v.position limit 1),
      'variant_count', (select count(*) from public.product_variants v where v.product_id = p.id and v.status = 'active'),
      'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'width', i.width, 'height', i.height, 'alt', i.alt) order by i.position)
                           from (select * from public.product_images i where i.product_id = p.id order by i.position limit 2) i), '[]'::jsonb),
      'availability', (
        select case
          when bool_or(a = 'in_stock') then 'in_stock'
          when bool_or(a = 'low_stock') then 'low_stock'
          else 'out_of_stock' end
        from (
          select app.variant_availability(inv) as a
          from public.product_variants v
          left join public.inventory_items inv on inv.variant_id = v.id
            and inv.branch_id = (select b.id from public.branches b where b.tenant_id = p.tenant_id and b.is_default)
          where v.product_id = p.id and v.status = 'active'
        ) s
      )
    ) as card
    from unnest(p_ids) with ordinality as ids(id, ord)
    join public.products p on p.id = ids.id
  ) cards
$$;

revoke all on function app.product_cards(uuid[]) from public;

create or replace function public.storefront_catalog(
  p_tenant     uuid,
  p_locale     text default 'en',
  p_query      text default null,
  p_category   text default null,
  p_min_price  bigint default null,
  p_max_price  bigint default null,
  p_available  boolean default false,
  p_featured   boolean default false,
  p_sort       text default 'featured',
  p_limit      integer default 24,
  p_offset     integer default 0,
  p_exclude    uuid default null
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ids   uuid[];
  v_total integer;
  v_q     text := nullif(app.normalize_search(btrim(p_query)), '');
  v_cat   uuid;
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant and t.status = 'active') then
    return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
  end if;
  if p_category is not null then
    select c.id into v_cat from public.categories c
    where c.tenant_id = p_tenant and c.slug = p_category and c.status = 'active';
    if v_cat is null then
      return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
    end if;
  end if;

  with recursive cat_tree(id) as (
    select v_cat where v_cat is not null
    union
    select c.id from public.categories c join cat_tree t on c.parent_id = t.id where c.status = 'active'
  ),
  filtered as (
    select p.*
    from public.products p
    where p.tenant_id = p_tenant
      and p.status = 'active'
      and p.price_min_minor is not null
      and (p_exclude is null or p.id <> p_exclude)
      and (v_q is null or p.search_text like '%' || v_q || '%')
      and (v_cat is null or exists (select 1 from public.product_categories pc where pc.product_id = p.id and pc.category_id in (select id from cat_tree)))
      and (p_min_price is null or p.price_max_minor >= p_min_price)
      and (p_max_price is null or p.price_min_minor <= p_max_price)
      and (not p_featured or p.featured)
      and (not p_available or exists (
        select 1 from public.product_variants v
        left join public.inventory_items inv on inv.variant_id = v.id
          and inv.branch_id = (select b.id from public.branches b where b.tenant_id = p.tenant_id and b.is_default)
        where v.product_id = p.id and v.status = 'active' and app.variant_availability(inv) <> 'out_of_stock'))
  )
  select count(*)::int,
         (array_agg(f.id order by
            case when p_sort = 'price_asc' then f.price_min_minor end asc nulls last,
            case when p_sort = 'price_desc' then f.price_max_minor end desc nulls last,
            case when p_sort = 'newest' then f.published_at end desc nulls last,
            case when p_sort = 'name' then coalesce(f.name ->> p_locale, f.name ->> 'en', f.name ->> 'ar', f.name ->> 'fr') end asc,
            case when p_sort = 'featured' then f.featured end desc,
            f.position asc, f.created_at desc))[greatest(p_offset, 0) + 1 : greatest(p_offset, 0) + least(greatest(p_limit, 1), 60)]
    into v_total, v_ids
  from filtered f;

  return jsonb_build_object('total', coalesce(v_total, 0), 'items', app.product_cards(coalesce(v_ids, '{}')));
end;
$$;

revoke all on function public.storefront_catalog(uuid, text, text, text, bigint, bigint, boolean, boolean, text, integer, integer, uuid) from public;
grant execute on function public.storefront_catalog(uuid, text, text, text, bigint, bigint, boolean, boolean, text, integer, integer, uuid) to anon, authenticated, service_role;

-- Full product for the product page.
create or replace function public.storefront_product(p_tenant uuid, p_slug text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'subtitle', p.subtitle,
    'description', p.description,
    'featured', p.featured,
    'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'path', i.storage_path, 'width', i.width, 'height', i.height, 'alt', i.alt) order by i.position)
                         from public.product_images i where i.product_id = p.id), '[]'::jsonb),
    'options', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', o.id, 'name', o.name,
                           'values', (select jsonb_agg(jsonb_build_object('id', ov.id, 'label', ov.label) order by ov.position)
                                      from public.product_option_values ov where ov.option_id = o.id)) order by o.position)
                         from public.product_options o where o.product_id = p.id), '[]'::jsonb),
    'variants', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', v.id, 'sku', v.sku, 'option_value_ids', to_jsonb(v.option_value_ids),
                            'price', v.price_minor, 'compare_at', v.compare_at_minor, 'image_id', v.image_id,
                            'weight_g', v.weight_g, 'availability', app.variant_availability(inv)) order by v.position)
                          from public.product_variants v
                          left join public.inventory_items inv on inv.variant_id = v.id
                            and inv.branch_id = (select b.id from public.branches b where b.tenant_id = p.tenant_id and b.is_default)
                          where v.product_id = p.id and v.status = 'active'), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'parent_id', c.parent_id) order by pc.position)
                             from public.product_categories pc join public.categories c on c.id = pc.category_id
                             where pc.product_id = p.id and c.status = 'active'), '[]'::jsonb),
    'updated_at', p.updated_at
  )
  from public.products p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.tenant_id = p_tenant and p.slug = p_slug and p.status = 'active'
$$;

revoke all on function public.storefront_product(uuid, text) from public;
grant execute on function public.storefront_product(uuid, text) to anon, authenticated, service_role;

-- Active categories with their active-product counts (for navigation).
create or replace function public.storefront_categories(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description,
           'image_path', c.image_path, 'parent_id', c.parent_id,
           'product_count', (select count(*) from public.product_categories pc
                              join public.products p on p.id = pc.product_id and p.status = 'active' and p.price_min_minor is not null
                              where pc.category_id = c.id)
         ) order by c.position, c.created_at), '[]'::jsonb)
  from public.categories c
  join public.tenants t on t.id = c.tenant_id and t.status = 'active'
  where c.tenant_id = p_tenant and c.status = 'active'
$$;

revoke all on function public.storefront_categories(uuid) from public;
grant execute on function public.storefront_categories(uuid) to anon, authenticated, service_role;

-- Low-stock report for the dashboard/inventory (staff with inventory.read).
create or replace function public.low_stock_items(p_tenant uuid, p_limit integer default 50)
returns table (
  inventory_item_id uuid, product_id uuid, product_name jsonb, variant_id uuid, sku text,
  option_labels jsonb, available integer, min_stock integer
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (app.has_permission(p_tenant, 'inventory.read') or app.is_super_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select inv.id, p.id, p.name, v.id, v.sku,
           (select coalesce(jsonb_agg(ov.label order by o.position), '[]'::jsonb)
              from public.product_option_values ov join public.product_options o on o.id = ov.option_id
              where ov.id = any (v.option_value_ids)),
           inv.on_hand - inv.reserved, inv.min_stock
    from public.inventory_items inv
    join public.product_variants v on v.id = inv.variant_id and v.status = 'active'
    join public.products p on p.id = v.product_id and p.status <> 'archived'
    where inv.tenant_id = p_tenant and inv.track_stock
      and inv.on_hand - inv.reserved <= inv.min_stock
    order by inv.on_hand - inv.reserved, p.created_at
    limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.low_stock_items(uuid, integer) from public;
grant execute on function public.low_stock_items(uuid, integer) to authenticated;
