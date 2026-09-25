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
