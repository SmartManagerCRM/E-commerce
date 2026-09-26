-- Phase 4: catalog & inventory isolation, public exposure and stock integrity.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

create function pg_temp.act_as(uid uuid, role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when uid is null then json_build_object('role', role)::text
         else json_build_object('sub', uid, 'role', role)::text end, true);
end $$;

create function pg_temp.affected(stmt text) returns int language plpgsql as $$
declare n int;
begin execute stmt; get diagnostics n = row_count; return n; end $$;

\set A '''a0000000-0000-4000-8000-00000000000a'''
\set B '''b0000000-0000-4000-8000-00000000000b'''

alter table public.tenant_members disable trigger tenant_members_guard_last_owner;
delete from public.tenant_members where tenant_id in (:A, :B);
alter table public.tenant_members enable trigger tenant_members_guard_last_owner;
update public.tenants set status = 'active' where id in (:A, :B);
delete from public.products where tenant_id in (:A, :B);
delete from public.categories where tenant_id in (:A, :B);

insert into auth.users (id, email) values
  ('11111111-0000-4000-8000-0000000000d1', 'p4-owner-a@test.local'),
  ('11111111-0000-4000-8000-0000000000d2', 'p4-staff-a@test.local'),
  ('22222222-0000-4000-8000-0000000000d1', 'p4-owner-b@test.local');
insert into public.tenant_members (tenant_id, user_id, role_id)
select v.t::uuid, v.u::uuid, r.id from (values
  (:A, '11111111-0000-4000-8000-0000000000d1', 'tenant_owner'),
  (:A, '11111111-0000-4000-8000-0000000000d2', 'staff'),
  (:B, '22222222-0000-4000-8000-0000000000d1', 'tenant_owner')) v(t, u, k)
join public.roles r on r.is_system and r.key = v.k;

-- Fixtures: A has an active and a draft product; B has one active product.
insert into public.products (id, tenant_id, name, slug, status) values
  ('d1000000-0000-4000-8000-000000000001', :A, '{"en":"A Active"}', 'a-active', 'active'),
  ('d1000000-0000-4000-8000-000000000002', :A, '{"en":"A Draft"}', 'a-draft', 'draft'),
  ('d2000000-0000-4000-8000-000000000001', :B, '{"en":"B Active"}', 'b-active', 'active'),
  ('d2000000-0000-4000-8000-000000000002', :B, '{"en":"B Empty"}', 'b-empty', 'draft');
insert into public.product_variants (tenant_id, product_id, sku, price_minor) values
  (:A, 'd1000000-0000-4000-8000-000000000001', 'A-1', 1000),
  (:A, 'd1000000-0000-4000-8000-000000000002', 'A-2', 2000),
  (:B, 'd2000000-0000-4000-8000-000000000001', 'B-1', 3000);
update public.inventory_items set cost_minor = 400 where tenant_id in (:A, :B);

-- ---------------------------------------------------------------------------
-- Anonymous storefront
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null, 'anon');
set local role anon;
select throws_ok($$ select * from public.products $$, '42501', null, 'anon cannot read products table directly');
select throws_ok($$ select * from public.inventory_items $$, '42501', null, 'anon cannot read inventory (cost, quantities)');
select is((public.storefront_catalog('a0000000-0000-4000-8000-00000000000a') ->> 'total')::int, 1, 'Storefront lists only active products');
select is(public.storefront_catalog('a0000000-0000-4000-8000-00000000000a') -> 'items' -> 0 ->> 'slug', 'a-active', 'The listed product is the active one');
select is(public.storefront_product('a0000000-0000-4000-8000-00000000000a', 'a-draft'), null, 'Draft products are not reachable by slug');
select is(public.storefront_product('a0000000-0000-4000-8000-00000000000a', 'b-active'), null, 'Another tenant''s product is not reachable through this tenant');
select ok(public.storefront_product('a0000000-0000-4000-8000-00000000000a', 'a-active')::text !~ 'cost|on_hand|reserved', 'Product payload never contains cost or quantities');
select is(public.storefront_product('a0000000-0000-4000-8000-00000000000a', 'a-active') -> 'variants' -> 0 ->> 'availability', 'out_of_stock', 'Tracked variant with no stock is out of stock');
reset role;

update public.tenants set status = 'suspended' where id = :B;
select pg_temp.act_as(null, 'anon');
set local role anon;
select is((public.storefront_catalog('b0000000-0000-4000-8000-00000000000b') ->> 'total')::int, 0, 'Suspended stores list nothing');
reset role;
update public.tenants set status = 'active' where id = :B;

-- ---------------------------------------------------------------------------
-- Owner of Tenant A
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-0000-4000-8000-0000000000d1');
set local role authenticated;
select is((select count(*)::int from public.products), 2, 'Owner A sees both of A''s products (incl. draft) and none of B''s');
select is((select count(*)::int from public.product_variants where tenant_id = :B), 0, 'Owner A cannot see B''s variants');
select is((select count(*)::int from public.inventory_items where tenant_id = :B), 0, 'Owner A cannot see B''s inventory or costs');
select is(pg_temp.affected($$ update public.products set status = 'archived' where tenant_id = 'b0000000-0000-4000-8000-00000000000b' $$), 0, 'Owner A cannot modify B''s products');
select throws_ok(
  $$ insert into public.products (tenant_id, name, slug) values ('b0000000-0000-4000-8000-00000000000b', '{"en":"x"}', 'x') $$,
  '42501', null, 'Owner A cannot create products in B');
select throws_ok(
  $$ insert into public.product_variants (tenant_id, product_id, price_minor) values ('a0000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-000000000002', 1) $$,
  '23503', null, 'A variant cannot point at another tenant''s product (composite FK)');
select throws_ok(
  $$ insert into public.product_images (tenant_id, product_id, storage_path, width, height) values ('a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b/products/x.webp', 10, 10) $$,
  '23514', null, 'Product images must live in the tenant''s own storage folder');
select lives_ok(
  $$ insert into public.products (tenant_id, name, slug, status) values ('a0000000-0000-4000-8000-00000000000a', '{"ar":"منتج"}', 'new-product', 'draft') $$,
  'Owner A can create a product');
select throws_ok(
  $$ update public.products set price_min_minor = 1 where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'Derived columns (price range, search text) are not client-writable');
select throws_ok(
  $$ update public.inventory_items set on_hand = 100 where tenant_id = 'a0000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'Stock quantities cannot be written directly');

-- Stock through the audited function
select is(public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), 10, 'restock', 'Delivery'), 10, 'adjust_stock adds stock');
select is(public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), -3, 'damage'), 7, 'adjust_stock removes stock');
select throws_ok($$ select public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), -8, 'adjustment') $$,
  '23514', null, 'Stock cannot go below zero');
select throws_ok($$ select public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), 5, 'sale') $$,
  '22023', null, 'Staff cannot record sales manually');
select is((select count(*)::int from public.stock_movements m join public.inventory_items i on i.id = m.inventory_item_id join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), 2, 'Every change is in the movement ledger');
select is((select on_hand_after from public.stock_movements order by id desc limit 1), 7, 'Ledger records the resulting stock');
reset role;

select pg_temp.act_as(null, 'anon');
set local role anon;
select is(public.storefront_product('a0000000-0000-4000-8000-00000000000a', 'a-active') -> 'variants' -> 0 ->> 'availability', 'in_stock', 'Stocked variant becomes available');
reset role;

-- ---------------------------------------------------------------------------
-- Staff of Tenant A (catalog.read, inventory.read, no writes)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-0000-4000-8000-0000000000d2');
set local role authenticated;
select ok((select count(*) from public.products) > 0, 'Staff can view the catalog');
select throws_ok(
  $$ insert into public.products (tenant_id, name, slug) values ('a0000000-0000-4000-8000-00000000000a', '{"en":"x"}', 'staff-x') $$,
  '42501', null, 'Staff cannot create products');
select throws_ok($$ select public.adjust_stock((select id from public.inventory_items limit 1), 1, 'restock') $$,
  '42501', null, 'Staff cannot change stock');
select ok((select count(*) from public.low_stock_items('a0000000-0000-4000-8000-00000000000a')) >= 0, 'Staff can read the low-stock report');
reset role;

-- ---------------------------------------------------------------------------
-- Owner of Tenant B and plan limits
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-0000-4000-8000-0000000000d1');
set local role authenticated;
select throws_ok($$ select public.adjust_stock((select i.id from public.inventory_items i join public.product_variants v on v.id = i.variant_id where v.sku = 'A-1'), 1, 'restock') $$,
  'P0002', null, 'Owner B cannot see (or adjust) A''s stock');
select throws_ok($$ select * from public.low_stock_items('a0000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Owner B cannot read A''s low-stock report');
reset role;

insert into public.tenant_feature_overrides (tenant_id, feature_key, enabled, limit_value) values (:B, 'max_products', true, 1)
on conflict (tenant_id, feature_key) do update set limit_value = 1;
select pg_temp.act_as('22222222-0000-4000-8000-0000000000d1');
set local role authenticated;
select throws_ok(
  $$ insert into public.products (tenant_id, name, slug) values ('b0000000-0000-4000-8000-00000000000b', '{"en":"Second"}', 'second') $$,
  '53400', null, 'The max_products plan limit is enforced');
reset role;

select * from finish();
rollback;
