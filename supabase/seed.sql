-- =============================================================================
-- Development seed (NOT for production).
-- Two tenants with deliberately different configuration so isolation,
-- language and entitlement behaviour can be tested:
--   Tenant A · Roasters Café   — café, SAR, Arabic default, Professional plan
--   Tenant B · Maison Coffeehouse — retail, EUR, French default, Starter plan
-- Staff users are not seeded here (no passwords in the repository); create
-- them with `npm run dev:user`.
-- =============================================================================

insert into public.tenants (id, slug, business_name, business_type, status, currency, timezone,
                            default_language, enabled_languages, country, city, phone, email,
                            description, tagline, address)
values
  ('a0000000-0000-4000-8000-00000000000a', 'roasters', 'Roasters Café', 'cafe', 'active', 'SAR', 'Asia/Riyadh',
   'ar', array['ar', 'en', 'fr'], 'SA', 'Riyadh', '+966 11 000 0000', 'hello@roasters.test',
   '{"en":"Specialty coffee roasted in small batches in Riyadh.","fr":"Café de spécialité torréfié en petites quantités à Riyad.","ar":"قهوة مختصة تُحمَّص بكميات صغيرة في الرياض."}',
   '{"en":"Roasted with care, served with soul.","fr":"Torréfié avec soin, servi avec âme.","ar":"محمّصة بعناية، تُقدَّم بشغف."}',
   '{"line1":"King Fahd Road","city":"Riyadh","country":"SA"}'),
  ('b0000000-0000-4000-8000-00000000000b', 'coffeehouse', 'Maison Coffeehouse', 'retail', 'active', 'EUR', 'Europe/Paris',
   'fr', array['fr', 'en'], 'FR', 'Paris', '+33 1 00 00 00 00', 'bonjour@coffeehouse.test',
   '{"en":"Coffee beans, equipment and gifts.","fr":"Grains de café, matériel et coffrets cadeaux."}',
   '{"en":"Everything for better coffee at home.","fr":"Tout pour un meilleur café à la maison."}',
   '{"line1":"12 rue des Martyrs","city":"Paris","country":"FR"}')
on conflict (id) do nothing;

insert into public.tenant_domains (tenant_id, hostname, is_primary, verified_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'roasters.test', true, now()),
  ('b0000000-0000-4000-8000-00000000000b', 'coffeehouse.test', true, now())
on conflict (hostname) do nothing;

update public.storefront_configs set theme_key = 'premium-cafe',
  tokens = '{"colors":{"primary":"#6B3F24","accent":"#C8A27A"}}'
where tenant_id = 'a0000000-0000-4000-8000-00000000000a';

update public.storefront_configs set theme_key = 'modern-retail',
  tokens = '{"colors":{"primary":"#1F3A34","accent":"#D98E5F"}}'
where tenant_id = 'b0000000-0000-4000-8000-00000000000b';

insert into public.tenant_subscriptions (tenant_id, plan_id, status)
select 'a0000000-0000-4000-8000-00000000000a', id, 'active' from public.plans where key = 'professional'
on conflict do nothing;

insert into public.tenant_subscriptions (tenant_id, plan_id, status)
select 'b0000000-0000-4000-8000-00000000000b', id, 'active' from public.plans where key = 'starter'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Catalog (Phase 4): categories, products with options/variants and stock.
-- No images are seeded (storage is empty); cards show a tinted placeholder.
-- -----------------------------------------------------------------------------
insert into public.categories (id, tenant_id, name, slug, description, position) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"حبوب القهوة","en":"Coffee beans","fr":"Cafés en grains"}', 'coffee-beans',
   '{"ar":"محاصيل مختارة تُحمَّص أسبوعيًا.","en":"Single origins roasted every week.","fr":"Origines uniques torréfiées chaque semaine."}', 0),
  ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"أدوات التحضير","en":"Brewing gear","fr":"Matériel"}', 'brewing-gear', '{}', 1),
  ('c2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
   '{"fr":"Accessoires","en":"Accessories"}', 'accessoires', '{}', 0)
on conflict (id) do nothing;

insert into public.products (id, tenant_id, name, slug, subtitle, description, status, featured, position) values
  ('d1000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"إثيوبيا يرغاتشيفي","en":"Ethiopia Yirgacheffe","fr":"Éthiopie Yirgacheffe"}', 'ethiopia-yirgacheffe',
   '{"ar":"نكهات الياسمين والليمون","en":"Jasmine, lemon, bergamot","fr":"Jasmin, citron, bergamote"}',
   '{"ar":"قهوة مغسولة من مرتفعات يرغاتشيفي، محمّصة تحميصًا فاتحًا لإبراز حموضتها الزهرية.","en":"A washed coffee from the Yirgacheffe highlands, light-roasted to highlight its floral acidity.","fr":"Un café lavé des hauts plateaux de Yirgacheffe, torréfié clair pour révéler son acidité florale."}',
   'active', true, 0),
  ('d1000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"كولومبيا هويلا","en":"Colombia Huila","fr":"Colombie Huila"}', 'colombia-huila',
   '{"ar":"كراميل وتفاح أحمر","en":"Caramel, red apple","fr":"Caramel, pomme rouge"}', '{}', 'active', false, 1),
  ('d1000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"قمع V60","en":"V60 dripper","fr":"Dripper V60"}', 'v60-dripper',
   '{"ar":"سيراميك، مقاس 02","en":"Ceramic, size 02","fr":"Céramique, taille 02"}', '{}', 'active', false, 2),
  ('d1000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-00000000000a',
   '{"ar":"خلطة الإسبريسو","en":"House espresso blend","fr":"Mélange espresso maison"}', 'house-espresso',
   '{}', '{}', 'draft', false, 3),
  ('d2000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-00000000000b',
   '{"fr":"Tasse en céramique","en":"Ceramic cup"}', 'tasse-ceramique', '{}', '{}', 'active', true, 0)
on conflict (id) do nothing;

insert into public.product_categories (tenant_id, product_id, category_id, position) values
  ('a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', 0),
  ('a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000001', 0),
  ('a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000013', 'c1000000-0000-4000-8000-000000000002', 0),
  ('b0000000-0000-4000-8000-00000000000b', 'd2000000-0000-4000-8000-000000000011', 'c2000000-0000-4000-8000-000000000001', 0)
on conflict do nothing;

insert into public.product_options (id, tenant_id, product_id, name, position) values
  ('e1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000011',
   '{"ar":"الوزن","en":"Size","fr":"Poids"}', 0)
on conflict (id) do nothing;

insert into public.product_option_values (id, tenant_id, option_id, label, position) values
  ('e1000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001',
   '{"ar":"250 غ","en":"250 g","fr":"250 g"}', 0),
  ('e1000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-00000000000a', 'e1000000-0000-4000-8000-000000000001',
   '{"ar":"1 كغ","en":"1 kg","fr":"1 kg"}', 1)
on conflict (id) do nothing;

-- Subscriptions exist above, so new variants get stock tracking per the plan.
insert into public.product_variants (id, tenant_id, product_id, sku, option_value_ids, price_minor, compare_at_minor, weight_g, position) values
  ('f1000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000011',
   'ETH-YIR-250', array['e1000000-0000-4000-8000-000000000011']::uuid[], 6500, null, 250, 0),
  ('f1000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000011',
   'ETH-YIR-1KG', array['e1000000-0000-4000-8000-000000000012']::uuid[], 22000, null, 1000, 1),
  ('f1000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000012',
   'COL-HUI-250', '{}', 5800, null, 250, 0),
  ('f1000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000013',
   'V60-02-WHT', '{}', 8500, 11000, 400, 0),
  ('f1000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-000000000014',
   'ESP-HOUSE', '{}', 5200, null, 250, 0),
  ('f2000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-00000000000b', 'd2000000-0000-4000-8000-000000000011',
   'TASSE-01', '{}', 1450, null, 300, 0)
on conflict (id) do nothing;

-- Opening stock for the café (recorded in the ledger like any other change).
with stock(variant_id, qty, min_stock, cost) as (values
  ('f1000000-0000-4000-8000-000000000011'::uuid, 24, 5, 3200),
  ('f1000000-0000-4000-8000-000000000012'::uuid, 3, 5, 11000),
  ('f1000000-0000-4000-8000-000000000014'::uuid, 12, 2, 4000)
), updated as (
  update public.inventory_items i set on_hand = s.qty, min_stock = s.min_stock, cost_minor = s.cost
  from stock s where i.variant_id = s.variant_id and i.on_hand = 0
  returning i.tenant_id, i.id, i.on_hand
)
insert into public.stock_movements (tenant_id, inventory_item_id, delta, on_hand_after, reason, note)
select tenant_id, id, on_hand, on_hand, 'initial', 'Seed data' from updated;
