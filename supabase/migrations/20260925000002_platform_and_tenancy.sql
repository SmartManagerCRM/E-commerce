-- =============================================================================
-- 0002 · Platform & tenancy
-- currencies, tenants, domains, settings, storefront config, branches,
-- profiles, platform admins, roles/permissions, tenant members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Currencies (reference data). Money is stored as bigint minor units; the
-- exponent tells how many minor units make one major unit.
-- -----------------------------------------------------------------------------
create table public.currencies (
  code      char(3)  primary key check (code ~ '^[A-Z]{3}$'),
  exponent  smallint not null check (exponent between 0 and 4),
  name      jsonb    not null check (app.is_localized_text(name)),
  is_active boolean  not null default true
);

-- -----------------------------------------------------------------------------
-- Tenants
-- -----------------------------------------------------------------------------
create table public.tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                      check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$')
                      check (slug not in ('app', 'www', 'api', 'admin', 'platform', 'console', 'store',
                                          'mail', 'static', 'assets', 'cdn', 'status', 'docs',
                                          'help', 'support', 'auth', 'dashboard', 'billing')),
  business_name     text not null check (length(btrim(business_name)) between 1 and 120),
  business_type     text not null default 'other'
                      check (business_type in ('cafe', 'restaurant', 'retail', 'food', 'beauty',
                                               'salon', 'spa', 'gym', 'other')),
  status            text not null default 'onboarding'
                      check (status in ('onboarding', 'active', 'suspended', 'closed')),
  description       jsonb not null default '{}'::jsonb check (app.is_localized_text(description)),
  tagline           jsonb not null default '{}'::jsonb check (app.is_localized_text(tagline)),
  logo_path         text,
  favicon_path      text,
  phone             text check (phone is null or length(phone) <= 32),
  email             extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address           jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  country           char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  city              text,
  currency          char(3) not null references public.currencies (code),
  timezone          text not null default 'UTC',
  default_language  text not null default 'en',
  enabled_languages text[] not null default array['en']::text[],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tenants_languages_supported
    check (enabled_languages <@ app.supported_locales() and cardinality(enabled_languages) > 0),
  constraint tenants_default_language_enabled
    check (default_language = any (enabled_languages))
);

create trigger tenants_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();

-- Reject unknown time zones (pg_timezone_names is not immutable, so a trigger
-- does the check instead of a CHECK constraint).
create or replace function app.validate_tenant_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger tenants_validate_timezone before insert or update of timezone on public.tenants
  for each row execute function app.validate_tenant_timezone();

-- -----------------------------------------------------------------------------
-- Tenant domains (custom domains). Platform subdomains
-- (<slug>.<platform root domain>) resolve through tenants.slug instead.
-- -----------------------------------------------------------------------------
create table public.tenant_domains (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  hostname           text not null unique
                       check (hostname = lower(hostname))
                       check (hostname ~ '^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  is_primary         boolean not null default false,
  verification_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);

create unique index tenant_domains_one_primary on public.tenant_domains (tenant_id) where is_primary;
create index tenant_domains_tenant on public.tenant_domains (tenant_id);

-- -----------------------------------------------------------------------------
-- Tenant settings (one row per tenant; grouped JSON documents validated by
-- the application service layer with Zod).
-- -----------------------------------------------------------------------------
create table public.tenant_settings (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  checkout      jsonb not null default '{}'::jsonb check (jsonb_typeof(checkout) = 'object'),
  delivery      jsonb not null default '{}'::jsonb check (jsonb_typeof(delivery) = 'object'),
  booking       jsonb not null default '{}'::jsonb check (jsonb_typeof(booking) = 'object'),
  notifications jsonb not null default '{}'::jsonb check (jsonb_typeof(notifications) = 'object'),
  retention     jsonb not null default '{}'::jsonb check (jsonb_typeof(retention) = 'object'),
  tax           jsonb not null default '{}'::jsonb check (jsonb_typeof(tax) = 'object'),
  consent       jsonb not null default '{}'::jsonb check (jsonb_typeof(consent) = 'object'),
  updated_at    timestamptz not null default now()
);

create trigger tenant_settings_updated_at before update on public.tenant_settings
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Storefront configuration: theme + brand tokens + homepage sections + SEO.
-- -----------------------------------------------------------------------------
create table public.storefront_configs (
  tenant_id         uuid primary key references public.tenants (id) on delete cascade,
  theme_key         text not null default 'premium-cafe' check (theme_key ~ '^[a-z0-9-]{1,40}$'),
  tokens            jsonb not null default '{}'::jsonb check (jsonb_typeof(tokens) = 'object'),
  header            jsonb not null default '{}'::jsonb check (jsonb_typeof(header) = 'object'),
  footer            jsonb not null default '{}'::jsonb check (jsonb_typeof(footer) = 'object'),
  homepage_sections jsonb not null default '[]'::jsonb check (jsonb_typeof(homepage_sections) = 'array'),
  seo               jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  updated_at        timestamptz not null default now()
);

create trigger storefront_configs_updated_at before update on public.storefront_configs
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Branches. Every tenant has exactly one default branch (created automatically);
-- the multi-branch UI is only shown when the plan includes it.
-- -----------------------------------------------------------------------------
create table public.branches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  name          jsonb not null check (app.is_localized_text(name) and name <> '{}'::jsonb),
  slug          text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  address       jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  phone         text,
  timezone      text,
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  is_default    boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug)
);

create unique index branches_one_default on public.branches (tenant_id) where is_default;

create trigger branches_updated_at before update on public.branches
  for each row execute function app.set_updated_at();

-- New tenants automatically get their settings row, storefront config and
-- default branch, so every tenant is always in a complete state.
create or replace function app.bootstrap_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_settings (tenant_id) values (new.id);
  insert into public.storefront_configs (tenant_id, theme_key)
  values (
    new.id,
    case new.business_type
      when 'restaurant' then 'modern-restaurant'
      when 'food'       then 'modern-restaurant'
      when 'retail'     then 'modern-retail'
      when 'beauty'     then 'beauty'
      when 'salon'      then 'beauty'
      when 'spa'        then 'beauty'
      else 'premium-cafe'
    end
  );
  insert into public.branches (tenant_id, name, slug, is_default)
  values (new.id, jsonb_build_object('en', 'Main', 'fr', 'Principal', 'ar', 'الفرع الرئيسي'), 'main', true);
  return new;
end;
$$;

create trigger tenants_bootstrap after insert on public.tenants
  for each row execute function app.bootstrap_tenant();

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (full_name is null or length(full_name) <= 120),
  phone              text check (phone is null or length(phone) <= 32),
  avatar_path        text,
  preferred_language text check (preferred_language is null or preferred_language = any (app.supported_locales())),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, preferred_language)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''),
    case when new.raw_user_meta_data ->> 'locale' = any (app.supported_locales())
         then new.raw_user_meta_data ->> 'locale' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Platform (SmartManager) administrators. Never a tenant role.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  level      text not null default 'admin' check (level in ('owner', 'admin', 'support')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Roles & permissions. System roles have tenant_id NULL; tenants may define
-- custom roles later. Permissions are data, so new ones never need a code
-- change in RLS.
-- -----------------------------------------------------------------------------
create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module      text not null,
  description text
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants (id) on delete cascade,
  key         text not null check (key ~ '^[a-z_]{2,40}$'),
  name        jsonb not null check (app.is_localized_text(name)),
  is_system   boolean not null default false,
  rank        smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint roles_system_has_no_tenant check ((is_system and tenant_id is null) or (not is_system and tenant_id is not null)),
  constraint roles_key_unique unique nulls not distinct (tenant_id, key)
);

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.tenant_members (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    uuid not null references public.roles (id),
  branch_id  uuid,
  status     text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  -- A branch restriction must point at a branch of the same tenant.
  foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete set null (branch_id)
);

create index tenant_members_user on public.tenant_members (user_id);
create index tenant_members_role on public.tenant_members (role_id);

create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute function app.set_updated_at();

-- A member's role must be a system role or a custom role of the same tenant.
create or replace function app.validate_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_tenant uuid;
  role_system boolean;
begin
  select r.tenant_id, r.is_system into role_tenant, role_system
  from public.roles r where r.id = new.role_id;

  if not found or (not role_system and role_tenant is distinct from new.tenant_id) then
    raise exception 'Role does not belong to this tenant' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tenant_members_validate_role before insert or update of role_id, tenant_id on public.tenant_members
  for each row execute function app.validate_member_role();
