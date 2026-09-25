-- =============================================================================
-- 0006 · Reference data required in every environment:
-- currencies, permissions, system roles, features, default plans.
-- Plans are ordinary rows; Super Admin edits prices, limits and modules.
-- =============================================================================

insert into public.currencies (code, exponent, name) values
  ('SAR', 2, '{"en":"Saudi Riyal","fr":"Riyal saoudien","ar":"ريال سعودي"}'),
  ('AED', 2, '{"en":"UAE Dirham","fr":"Dirham des É.A.U.","ar":"درهم إماراتي"}'),
  ('KWD', 3, '{"en":"Kuwaiti Dinar","fr":"Dinar koweïtien","ar":"دينار كويتي"}'),
  ('BHD', 3, '{"en":"Bahraini Dinar","fr":"Dinar bahreïni","ar":"دينار بحريني"}'),
  ('QAR', 2, '{"en":"Qatari Riyal","fr":"Riyal qatari","ar":"ريال قطري"}'),
  ('OMR', 3, '{"en":"Omani Rial","fr":"Rial omanais","ar":"ريال عماني"}'),
  ('EGP', 2, '{"en":"Egyptian Pound","fr":"Livre égyptienne","ar":"جنيه مصري"}'),
  ('MAD', 2, '{"en":"Moroccan Dirham","fr":"Dirham marocain","ar":"درهم مغربي"}'),
  ('TND', 3, '{"en":"Tunisian Dinar","fr":"Dinar tunisien","ar":"دينار تونسي"}'),
  ('DZD', 2, '{"en":"Algerian Dinar","fr":"Dinar algérien","ar":"دينار جزائري"}'),
  ('JOD', 3, '{"en":"Jordanian Dinar","fr":"Dinar jordanien","ar":"دينار أردني"}'),
  ('USD', 2, '{"en":"US Dollar","fr":"Dollar américain","ar":"دولار أمريكي"}'),
  ('EUR', 2, '{"en":"Euro","fr":"Euro","ar":"يورو"}'),
  ('GBP', 2, '{"en":"British Pound","fr":"Livre sterling","ar":"جنيه إسترليني"}')
on conflict (code) do nothing;

insert into public.permissions (key, module, description) values
  ('dashboard.read',      'dashboard',     'View the dashboard'),
  ('orders.read',         'orders',        'View orders'),
  ('orders.write',        'orders',        'Update order status and details'),
  ('orders.export',       'orders',        'Export orders'),
  ('catalog.read',        'catalog',       'View products and categories'),
  ('catalog.write',       'catalog',       'Create and edit products and categories'),
  ('inventory.read',      'inventory',     'View stock levels and movements'),
  ('inventory.write',     'inventory',     'Adjust stock'),
  ('customers.read',      'customers',     'View customers'),
  ('customers.write',     'customers',     'Edit customers'),
  ('customers.export',    'customers',     'Export customers'),
  ('bookings.read',       'bookings',      'View bookings'),
  ('bookings.write',      'bookings',      'Manage bookings and booking resources'),
  ('marketing.read',      'marketing',     'View coupons, promotions, loyalty and campaigns'),
  ('marketing.write',     'marketing',     'Manage coupons, promotions, loyalty and campaigns'),
  ('subscriptions.read',  'subscriptions', 'View product subscriptions'),
  ('subscriptions.write', 'subscriptions', 'Manage product subscriptions'),
  ('analytics.read',      'analytics',     'View analytics'),
  ('appearance.read',     'appearance',    'View storefront appearance'),
  ('appearance.write',    'appearance',    'Customize storefront appearance'),
  ('settings.read',       'settings',      'View business settings'),
  ('settings.write',      'settings',      'Change business settings'),
  ('branches.write',      'settings',      'Manage branches'),
  ('payments.read',       'payments',      'View payments and payment configuration'),
  ('payments.write',      'payments',      'Configure payment providers'),
  ('payments.refund',     'payments',      'Issue refunds'),
  ('staff.read',          'staff',         'View staff members'),
  ('staff.write',         'staff',         'Invite and manage staff members'),
  ('audit.read',          'audit',         'View the audit log'),
  ('media.write',         'media',         'Upload and delete media'),
  ('ai.use',              'ai',            'Use the AI business assistant')
on conflict (key) do nothing;

insert into public.roles (tenant_id, key, name, is_system, rank) values
  (null, 'tenant_owner', '{"en":"Owner","fr":"Propriétaire","ar":"المالك"}',  true, 100),
  (null, 'admin',        '{"en":"Administrator","fr":"Administrateur","ar":"مسؤول"}', true, 80),
  (null, 'manager',      '{"en":"Manager","fr":"Gérant","ar":"مدير"}',       true, 60),
  (null, 'staff',        '{"en":"Staff","fr":"Employé","ar":"موظف"}',        true, 40)
on conflict on constraint roles_key_unique do nothing;

-- Owner: implicit "all permissions" (see app.has_permission); rows are still
-- stored so listings are accurate.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.is_system and r.key in ('tenant_owner', 'admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'dashboard.read', 'orders.read', 'orders.write', 'orders.export',
  'catalog.read', 'catalog.write', 'inventory.read', 'inventory.write',
  'customers.read', 'customers.write', 'bookings.read', 'bookings.write',
  'marketing.read', 'marketing.write', 'subscriptions.read', 'subscriptions.write',
  'analytics.read', 'appearance.read', 'settings.read', 'payments.read',
  'staff.read', 'media.write', 'ai.use'
)
where r.is_system and r.key = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in (
  'dashboard.read', 'orders.read', 'orders.write', 'catalog.read',
  'inventory.read', 'customers.read', 'bookings.read', 'bookings.write'
)
where r.is_system and r.key = 'staff'
on conflict do nothing;

insert into public.features (key, module, kind, name, sort_order) values
  ('storefront',            'core',          'boolean', '{"en":"Online store","fr":"Boutique en ligne","ar":"المتجر الإلكتروني"}', 10),
  ('catalog',               'catalog',       'boolean', '{"en":"Products & categories","fr":"Produits et catégories","ar":"المنتجات والفئات"}', 20),
  ('orders',                'orders',        'boolean', '{"en":"Orders","fr":"Commandes","ar":"الطلبات"}', 30),
  ('customers',             'customers',     'boolean', '{"en":"Customers","fr":"Clients","ar":"العملاء"}', 40),
  ('basic_analytics',       'analytics',     'boolean', '{"en":"Basic analytics","fr":"Statistiques de base","ar":"تحليلات أساسية"}', 50),
  ('inventory',             'inventory',     'boolean', '{"en":"Inventory","fr":"Inventaire","ar":"المخزون"}', 60),
  ('coupons',               'marketing',     'boolean', '{"en":"Coupons","fr":"Codes promo","ar":"القسائم"}', 70),
  ('promotions',            'marketing',     'boolean', '{"en":"Promotions","fr":"Promotions","ar":"العروض"}', 80),
  ('loyalty',               'marketing',     'boolean', '{"en":"Loyalty","fr":"Fidélité","ar":"الولاء"}', 90),
  ('advanced_analytics',    'analytics',     'boolean', '{"en":"Advanced analytics","fr":"Statistiques avancées","ar":"تحليلات متقدمة"}', 100),
  ('delivery',              'delivery',      'boolean', '{"en":"Delivery","fr":"Livraison","ar":"التوصيل"}', 110),
  ('abandoned_cart',        'marketing',     'boolean', '{"en":"Abandoned-cart recovery","fr":"Paniers abandonnés","ar":"استرجاع السلات المتروكة"}', 120),
  ('booking',               'booking',       'boolean', '{"en":"Table & appointment booking","fr":"Réservations","ar":"الحجوزات"}', 130),
  ('qr_ordering',           'orders',        'boolean', '{"en":"QR table ordering","fr":"Commande par QR code","ar":"الطلب عبر رمز QR"}', 140),
  ('product_subscriptions', 'subscriptions', 'boolean', '{"en":"Product subscriptions","fr":"Abonnements produits","ar":"اشتراكات المنتجات"}', 150),
  ('multi_branch',          'branches',      'boolean', '{"en":"Multiple branches","fr":"Plusieurs établissements","ar":"فروع متعددة"}', 160),
  ('automation',            'automation',    'boolean', '{"en":"Advanced automation","fr":"Automatisation avancée","ar":"أتمتة متقدمة"}', 170),
  ('daily_brief',           'automation',    'boolean', '{"en":"Daily business brief","fr":"Résumé quotidien","ar":"الملخص اليومي"}', 180),
  ('ai_assistant',          'ai',            'boolean', '{"en":"AI business assistant","fr":"Assistant IA","ar":"المساعد الذكي"}', 190),
  ('custom_domain',         'core',          'boolean', '{"en":"Custom domain","fr":"Domaine personnalisé","ar":"نطاق مخصص"}', 200),
  ('max_products',          'limits',        'limit',   '{"en":"Products","fr":"Produits","ar":"المنتجات"}', 900),
  ('max_staff',             'limits',        'limit',   '{"en":"Staff accounts","fr":"Comptes employés","ar":"حسابات الموظفين"}', 910),
  ('max_branches',          'limits',        'limit',   '{"en":"Branches","fr":"Établissements","ar":"الفروع"}', 920),
  ('storage_mb',            'limits',        'limit',   '{"en":"Storage (MB)","fr":"Stockage (Mo)","ar":"التخزين (ميغابايت)"}', 930)
on conflict (key) do nothing;

-- Default plans. Prices are initial values for Super Admin to adjust.
insert into public.plans (key, name, description, price_minor, currency, billing_interval, sort_order) values
  ('starter',      '{"en":"Starter","fr":"Essentiel","ar":"المبتدئ"}',
                   '{"en":"Online store, products, orders and customers.","fr":"Boutique, produits, commandes et clients.","ar":"متجر إلكتروني ومنتجات وطلبات وعملاء."}',
                   14900, 'SAR', 'month', 10),
  ('business',     '{"en":"Business","fr":"Business","ar":"الأعمال"}',
                   '{"en":"Inventory, marketing, loyalty and delivery.","fr":"Inventaire, marketing, fidélité et livraison.","ar":"المخزون والتسويق والولاء والتوصيل."}',
                   29900, 'SAR', 'month', 20),
  ('professional', '{"en":"Professional","fr":"Professionnel","ar":"الاحترافي"}',
                   '{"en":"Booking, QR ordering, subscriptions, branches and AI.","fr":"Réservations, commande QR, abonnements, multi-sites et IA.","ar":"الحجوزات والطلب عبر QR والاشتراكات والفروع والذكاء الاصطناعي."}',
                   59900, 'SAR', 'month', 30)
on conflict (key) do nothing;

with matrix(plan_key, feature_key, enabled, limit_value) as (
  values
    -- Starter
    ('starter', 'storefront', true, null), ('starter', 'catalog', true, null),
    ('starter', 'orders', true, null), ('starter', 'customers', true, null),
    ('starter', 'basic_analytics', true, null), ('starter', 'custom_domain', true, null),
    ('starter', 'max_products', true, 100), ('starter', 'max_staff', true, 2),
    ('starter', 'max_branches', true, 1), ('starter', 'storage_mb', true, 1024),
    -- Business
    ('business', 'storefront', true, null), ('business', 'catalog', true, null),
    ('business', 'orders', true, null), ('business', 'customers', true, null),
    ('business', 'basic_analytics', true, null), ('business', 'custom_domain', true, null),
    ('business', 'inventory', true, null), ('business', 'coupons', true, null),
    ('business', 'promotions', true, null), ('business', 'loyalty', true, null),
    ('business', 'advanced_analytics', true, null), ('business', 'delivery', true, null),
    ('business', 'abandoned_cart', true, null), ('business', 'daily_brief', true, null),
    ('business', 'max_products', true, 1000), ('business', 'max_staff', true, 10),
    ('business', 'max_branches', true, 1), ('business', 'storage_mb', true, 5120),
    -- Professional
    ('professional', 'storefront', true, null), ('professional', 'catalog', true, null),
    ('professional', 'orders', true, null), ('professional', 'customers', true, null),
    ('professional', 'basic_analytics', true, null), ('professional', 'custom_domain', true, null),
    ('professional', 'inventory', true, null), ('professional', 'coupons', true, null),
    ('professional', 'promotions', true, null), ('professional', 'loyalty', true, null),
    ('professional', 'advanced_analytics', true, null), ('professional', 'delivery', true, null),
    ('professional', 'abandoned_cart', true, null), ('professional', 'daily_brief', true, null),
    ('professional', 'booking', true, null), ('professional', 'qr_ordering', true, null),
    ('professional', 'product_subscriptions', true, null), ('professional', 'multi_branch', true, null),
    ('professional', 'automation', true, null), ('professional', 'ai_assistant', true, null),
    ('professional', 'max_products', true, null), ('professional', 'max_staff', true, 50),
    ('professional', 'max_branches', true, 10), ('professional', 'storage_mb', true, 20480)
)
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, m.feature_key, m.enabled, m.limit_value
from matrix m join public.plans p on p.key = m.plan_key
on conflict do nothing;
