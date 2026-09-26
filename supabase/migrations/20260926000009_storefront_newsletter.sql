-- =============================================================================
-- 0009 · Phase 3 — storefront newsletter sign-ups
-- Consent-based: a sign-up is stored only with explicit consent (timestamp +
-- source). Written exclusively by the server (service role) for the tenant
-- resolved from the request hostname, never for a client-supplied tenant.
-- Double opt-in e-mail confirmation arrives with the e-mail provider (Phase 7).
-- =============================================================================

create table public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  email           extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  locale          text not null check (locale = any (app.supported_locales())),
  status          text not null default 'subscribed' check (status in ('pending', 'subscribed', 'unsubscribed')),
  consent_at      timestamptz not null default now(),
  consent_source  text not null default 'storefront_newsletter',
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, email)
);

create index newsletter_subscribers_tenant on public.newsletter_subscribers (tenant_id, created_at desc);

create trigger newsletter_subscribers_updated_at before update on public.newsletter_subscribers
  for each row execute function app.set_updated_at();

alter table public.newsletter_subscribers enable row level security;

-- Staff with marketing access can read their own tenant's list.
grant select on public.newsletter_subscribers to authenticated;
create policy newsletter_subscribers_read on public.newsletter_subscribers for select to authenticated
  using (app.has_permission(tenant_id, 'marketing.read') or app.is_super_admin());

-- Idempotent sign-up used by the storefront server action (service role).
create or replace function public.newsletter_subscribe(p_tenant uuid, p_email text, p_locale text, p_source text default 'storefront_newsletter')
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tenants where id = p_tenant and status = 'active') then
    raise exception 'Store not available' using errcode = 'P0002';
  end if;
  insert into public.newsletter_subscribers (tenant_id, email, locale, consent_source)
  values (p_tenant, lower(p_email), p_locale, p_source)
  on conflict (tenant_id, email) do update
    set status = 'subscribed', unsubscribed_at = null, consent_at = now(),
        locale = excluded.locale, consent_source = excluded.consent_source;
end;
$$;

revoke all on function public.newsletter_subscribe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.newsletter_subscribe(uuid, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- resolve_storefront: also return the default branch's opening hours
-- (public information shown in the location section and structured data).
-- -----------------------------------------------------------------------------
create or replace function public.resolve_storefront(p_hostname text default null, p_slug text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  t     public.tenants%rowtype;
  sc    public.storefront_configs%rowtype;
  dom   text;
  hours jsonb;
begin
  if p_hostname is not null then
    select tn.* into t
    from public.tenant_domains d
    join public.tenants tn on tn.id = d.tenant_id
    where d.hostname = lower(p_hostname) and d.verified_at is not null;
  elsif p_slug is not null then
    select tn.* into t from public.tenants tn where tn.slug = lower(p_slug);
  else
    return null;
  end if;

  if not found or t.status = 'closed' then
    return null;
  end if;

  if t.status <> 'active' then
    return jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'business_name', t.business_name, 'status', t.status,
      'default_language', t.default_language, 'enabled_languages', to_jsonb(t.enabled_languages)
    );
  end if;

  select * into sc from public.storefront_configs where tenant_id = t.id;
  select d.hostname into dom from public.tenant_domains d
    where d.tenant_id = t.id and d.is_primary and d.verified_at is not null;
  select b.opening_hours into hours from public.branches b
    where b.tenant_id = t.id and b.is_default;

  return jsonb_build_object(
    'id', t.id,
    'slug', t.slug,
    'business_name', t.business_name,
    'business_type', t.business_type,
    'status', t.status,
    'description', t.description,
    'tagline', t.tagline,
    'logo_path', t.logo_path,
    'favicon_path', t.favicon_path,
    'phone', t.phone,
    'email', t.email,
    'address', t.address,
    'country', t.country,
    'city', t.city,
    'currency', t.currency,
    'currency_exponent', (select c.exponent from public.currencies c where c.code = t.currency),
    'timezone', t.timezone,
    'default_language', t.default_language,
    'enabled_languages', to_jsonb(t.enabled_languages),
    'primary_domain', dom,
    'opening_hours', coalesce(hours, '{}'::jsonb),
    'storefront', jsonb_build_object(
      'theme_key', sc.theme_key,
      'tokens', sc.tokens,
      'header', sc.header,
      'footer', sc.footer,
      'homepage_sections', sc.homepage_sections,
      'seo', sc.seo
    )
  );
end;
$$;

revoke all on function public.resolve_storefront(text, text) from public;
grant execute on function public.resolve_storefront(text, text) to anon, authenticated, service_role;
