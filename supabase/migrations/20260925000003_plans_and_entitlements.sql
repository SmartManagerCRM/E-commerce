-- =============================================================================
-- 0003 · SaaS plans & feature entitlements (database-driven, editable by
-- Super Admin — nothing about plans is hard-coded in the application).
-- =============================================================================

create table public.features (
  key         text primary key check (key ~ '^[a-z_]{2,60}$'),
  module      text not null,
  kind        text not null default 'boolean' check (kind in ('boolean', 'limit')),
  name        jsonb not null check (app.is_localized_text(name)),
  description jsonb not null default '{}'::jsonb check (app.is_localized_text(description)),
  sort_order  int  not null default 0
);

create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique check (key ~ '^[a-z0-9_-]{2,40}$'),
  name             jsonb not null check (app.is_localized_text(name)),
  description      jsonb not null default '{}'::jsonb check (app.is_localized_text(description)),
  price_minor      bigint not null default 0 check (price_minor >= 0),
  currency         char(3) not null references public.currencies (code),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  is_public        boolean not null default true,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function app.set_updated_at();

create table public.plan_features (
  plan_id     uuid not null references public.plans (id) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  enabled     boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

create table public.tenant_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  plan_id              uuid not null references public.plans (id),
  status               text not null default 'trialing'
                         check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,
  cancel_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- At most one "current" subscription per tenant.
create unique index tenant_subscriptions_one_current
  on public.tenant_subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due');

create trigger tenant_subscriptions_updated_at before update on public.tenant_subscriptions
  for each row execute function app.set_updated_at();

create table public.tenant_feature_overrides (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  enabled     boolean not null,
  limit_value integer check (limit_value is null or limit_value >= 0),
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);
