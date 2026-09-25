-- =============================================================================
-- 0004 · RLS helper functions, policies, grants and public RPCs.
--
-- Model:
--   * Every table has RLS enabled. anon/authenticated only get the privileges
--     granted explicitly below (0001 revoked the Supabase defaults).
--   * Helper functions are SECURITY DEFINER with an empty search_path, so they
--     can read membership tables without recursing through RLS and cannot be
--     hijacked by objects in other schemas.
--   * service_role and postgres bypass RLS by design; they are only used in
--     server-side code, migrations and administrative tooling.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------
create or replace function app.is_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  )
$$;

create or replace function app.is_tenant_member(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

create or replace function app.is_tenant_owner(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and r.is_system and r.key = 'tenant_owner'
  )
$$;

-- Owners implicitly hold every permission; other roles hold what
-- role_permissions grants them.
create or replace function app.has_permission(p_tenant uuid, p_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members m
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        (r.is_system and r.key = 'tenant_owner')
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = m.role_id and rp.permission_key = p_permission
        )
      )
  )
$$;

create or replace function app.current_plan_id(p_tenant uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select s.plan_id
  from public.tenant_subscriptions s
  where s.tenant_id = p_tenant
    and s.status in ('trialing', 'active', 'past_due')
  limit 1
$$;

-- Tenant override wins over the plan; missing means disabled.
create or replace function app.tenant_has_feature(p_tenant uuid, p_feature text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select o.enabled from public.tenant_feature_overrides o
      where o.tenant_id = p_tenant and o.feature_key = p_feature),
    (select pf.enabled from public.plan_features pf
      where pf.plan_id = app.current_plan_id(p_tenant) and pf.feature_key = p_feature),
    false
  )
$$;

-- NULL means unlimited (only meaningful when the feature is enabled).
create or replace function app.tenant_feature_limit(p_tenant uuid, p_feature text)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.tenant_feature_overrides o
                  where o.tenant_id = p_tenant and o.feature_key = p_feature)
      then (select o.limit_value from public.tenant_feature_overrides o
             where o.tenant_id = p_tenant and o.feature_key = p_feature)
    else (select pf.limit_value from public.plan_features pf
           where pf.plan_id = app.current_plan_id(p_tenant) and pf.feature_key = p_feature)
  end
$$;

revoke all on function app.is_super_admin()                  from public;
revoke all on function app.is_tenant_member(uuid)            from public;
revoke all on function app.is_tenant_owner(uuid)             from public;
revoke all on function app.has_permission(uuid, text)        from public;
revoke all on function app.current_plan_id(uuid)             from public;
revoke all on function app.tenant_has_feature(uuid, text)    from public;
revoke all on function app.tenant_feature_limit(uuid, text)  from public;
grant execute on function app.is_super_admin()                 to authenticated, service_role;
grant execute on function app.is_tenant_member(uuid)           to authenticated, service_role;
grant execute on function app.is_tenant_owner(uuid)            to authenticated, service_role;
grant execute on function app.has_permission(uuid, text)       to authenticated, service_role;
grant execute on function app.current_plan_id(uuid)            to authenticated, service_role;
grant execute on function app.tenant_has_feature(uuid, text)   to authenticated, service_role;
grant execute on function app.tenant_feature_limit(uuid, text) to authenticated, service_role;

-- True when the statement comes from an end-user API role (not service_role /
-- postgres). Used by guard triggers.
create or replace function app.is_end_user_role()
returns boolean
language sql stable
set search_path = ''
as $$ select current_user in ('anon', 'authenticated') $$;

grant execute on function app.is_end_user_role() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Guard triggers
-- -----------------------------------------------------------------------------

-- Tenant staff may edit their business profile but never slug, status or
-- currency; those go through platform tooling.
create or replace function app.guard_tenant_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_end_user_role() and not app.is_super_admin() then
    if new.id is distinct from old.id
       or new.slug is distinct from old.slug
       or new.status is distinct from old.status
       or new.currency is distinct from old.currency
       or new.created_at is distinct from old.created_at then
      raise exception 'Only platform administrators can change these tenant fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger tenants_guard_protected before update on public.tenants
  for each row execute function app.guard_tenant_protected_columns();

-- A tenant must always keep at least one active owner.
create or replace function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role uuid;
  remaining  int;
begin
  select id into owner_role from public.roles where is_system and key = 'tenant_owner';

  if old.role_id = owner_role and old.status = 'active'
     and (tg_op = 'DELETE' or new.role_id <> owner_role or new.status <> 'active') then
    -- Tenant itself is being deleted (cascade): allow.
    if not exists (select 1 from public.tenants where id = old.tenant_id) then
      return coalesce(new, old);
    end if;

    select count(*) into remaining
    from public.tenant_members
    where tenant_id = old.tenant_id
      and role_id = owner_role
      and status = 'active'
      and user_id <> old.user_id;

    if remaining = 0 then
      raise exception 'A tenant must keep at least one active owner' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tenant_members_guard_last_owner before update or delete on public.tenant_members
  for each row execute function app.guard_last_owner();

-- The default branch cannot be deleted.
create or replace function app.guard_default_branch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default and exists (select 1 from public.tenants where id = old.tenant_id) then
    raise exception 'The default branch cannot be deleted' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger branches_guard_default before delete on public.branches
  for each row execute function app.guard_default_branch();

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.currencies               enable row level security;
alter table public.tenants                  enable row level security;
alter table public.tenant_domains           enable row level security;
alter table public.tenant_settings          enable row level security;
alter table public.storefront_configs       enable row level security;
alter table public.branches                 enable row level security;
alter table public.profiles                 enable row level security;
alter table public.platform_admins          enable row level security;
alter table public.permissions              enable row level security;
alter table public.roles                    enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.tenant_members           enable row level security;
alter table public.features                 enable row level security;
alter table public.plans                    enable row level security;
alter table public.plan_features            enable row level security;
alter table public.tenant_subscriptions     enable row level security;
alter table public.tenant_feature_overrides enable row level security;

-- -----------------------------------------------------------------------------
-- Reference data: currencies, permissions, features, plans
-- -----------------------------------------------------------------------------
grant select on public.currencies to anon, authenticated;
grant insert, update, delete on public.currencies to authenticated;
create policy currencies_read on public.currencies for select to anon, authenticated using (true);
create policy currencies_admin_insert on public.currencies for insert to authenticated with check (app.is_super_admin());
create policy currencies_admin_update on public.currencies for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy currencies_admin_delete on public.currencies for delete to authenticated using (app.is_super_admin());

grant select on public.permissions to authenticated;
create policy permissions_read on public.permissions for select to authenticated using (true);

grant select on public.features to anon, authenticated;
grant insert, update, delete on public.features to authenticated;
create policy features_read on public.features for select to anon, authenticated using (true);
create policy features_admin_insert on public.features for insert to authenticated with check (app.is_super_admin());
create policy features_admin_update on public.features for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy features_admin_delete on public.features for delete to authenticated using (app.is_super_admin());

grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
create policy plans_read_public on public.plans for select to anon, authenticated
  using (is_public and is_active);
create policy plans_read_own on public.plans for select to authenticated
  using (
    app.is_super_admin()
    or exists (
      select 1 from public.tenant_subscriptions s
      where s.plan_id = plans.id and app.is_tenant_member(s.tenant_id)
    )
  );
create policy plans_admin_insert on public.plans for insert to authenticated with check (app.is_super_admin());
create policy plans_admin_update on public.plans for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy plans_admin_delete on public.plans for delete to authenticated using (app.is_super_admin());

grant select on public.plan_features to anon, authenticated;
grant insert, update, delete on public.plan_features to authenticated;
-- Visible whenever the parent plan is visible (the subquery is itself subject
-- to the plans policies).
create policy plan_features_read on public.plan_features for select to anon, authenticated
  using (exists (select 1 from public.plans p where p.id = plan_features.plan_id));
create policy plan_features_admin_insert on public.plan_features for insert to authenticated with check (app.is_super_admin());
create policy plan_features_admin_update on public.plan_features for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy plan_features_admin_delete on public.plan_features for delete to authenticated using (app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Tenants
-- Anonymous visitors never read this table directly; the storefront uses the
-- public.resolve_storefront() function, which returns public fields only.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.tenants to authenticated;

create policy tenants_member_read on public.tenants for select to authenticated
  using (app.is_tenant_member(id) or app.is_super_admin());
create policy tenants_member_update on public.tenants for update to authenticated
  using (app.has_permission(id, 'settings.write') or app.is_super_admin())
  with check (app.has_permission(id, 'settings.write') or app.is_super_admin());
create policy tenants_admin_insert on public.tenants for insert to authenticated
  with check (app.is_super_admin());
create policy tenants_admin_delete on public.tenants for delete to authenticated
  using (app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Tenant domains (custom-domain self-service with verification arrives in
-- Phase 2; until then only platform admins manage them).
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.tenant_domains to authenticated;

create policy tenant_domains_read on public.tenant_domains for select to authenticated
  using (app.has_permission(tenant_id, 'settings.read') or app.is_super_admin());
create policy tenant_domains_admin_insert on public.tenant_domains for insert to authenticated with check (app.is_super_admin());
create policy tenant_domains_admin_update on public.tenant_domains for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy tenant_domains_admin_delete on public.tenant_domains for delete to authenticated using (app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Tenant settings & storefront config (rows are created by the bootstrap
-- trigger; there is no client insert/delete).
-- -----------------------------------------------------------------------------
grant select, update on public.tenant_settings to authenticated;
create policy tenant_settings_read on public.tenant_settings for select to authenticated
  using (app.has_permission(tenant_id, 'settings.read') or app.is_super_admin());
create policy tenant_settings_update on public.tenant_settings for update to authenticated
  using (app.has_permission(tenant_id, 'settings.write') or app.is_super_admin())
  with check (app.has_permission(tenant_id, 'settings.write') or app.is_super_admin());

grant select, update on public.storefront_configs to authenticated;
create policy storefront_configs_read on public.storefront_configs for select to authenticated
  using (app.has_permission(tenant_id, 'appearance.read') or app.is_super_admin());
create policy storefront_configs_update on public.storefront_configs for update to authenticated
  using (app.has_permission(tenant_id, 'appearance.write') or app.is_super_admin())
  with check (app.has_permission(tenant_id, 'appearance.write') or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Branches. Creating additional branches requires the multi_branch entitlement.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.branches to authenticated;

create policy branches_read on public.branches for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.is_super_admin());
create policy branches_insert on public.branches for insert to authenticated
  with check (
    app.is_super_admin()
    or (app.has_permission(tenant_id, 'branches.write') and app.tenant_has_feature(tenant_id, 'multi_branch'))
  );
create policy branches_update on public.branches for update to authenticated
  using (app.has_permission(tenant_id, 'branches.write') or app.is_super_admin())
  with check (app.has_permission(tenant_id, 'branches.write') or app.is_super_admin());
create policy branches_delete on public.branches for delete to authenticated
  using (app.has_permission(tenant_id, 'branches.write') or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path, preferred_language) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_super_admin()
    or exists (
      select 1 from public.tenant_members m
      where m.user_id = profiles.id
        and app.has_permission(m.tenant_id, 'staff.read')
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Platform admins: readable by themselves and other platform admins; writes
-- only through server-side platform tooling (service_role).
-- -----------------------------------------------------------------------------
grant select on public.platform_admins to authenticated;
create policy platform_admins_read on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Roles & role permissions. Only owners manage custom roles, so a delegated
-- administrator cannot grant themselves new permissions.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.roles to authenticated;

create policy roles_read on public.roles for select to authenticated
  using (is_system or app.is_tenant_member(tenant_id) or app.is_super_admin());
create policy roles_owner_insert on public.roles for insert to authenticated
  with check (not is_system and tenant_id is not null and (app.is_tenant_owner(tenant_id) or app.is_super_admin()));
create policy roles_owner_update on public.roles for update to authenticated
  using (not is_system and (app.is_tenant_owner(tenant_id) or app.is_super_admin()))
  with check (not is_system and tenant_id is not null and (app.is_tenant_owner(tenant_id) or app.is_super_admin()));
create policy roles_owner_delete on public.roles for delete to authenticated
  using (not is_system and (app.is_tenant_owner(tenant_id) or app.is_super_admin()));

grant select, insert, delete on public.role_permissions to authenticated;

create policy role_permissions_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_permissions.role_id));
create policy role_permissions_owner_insert on public.role_permissions for insert to authenticated
  with check (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id and not r.is_system
      and (app.is_tenant_owner(r.tenant_id) or app.is_super_admin())
  ));
create policy role_permissions_owner_delete on public.role_permissions for delete to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id and not r.is_system
      and (app.is_tenant_owner(r.tenant_id) or app.is_super_admin())
  ));

-- -----------------------------------------------------------------------------
-- Tenant members
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.tenant_members to authenticated;

create policy tenant_members_read on public.tenant_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_permission(tenant_id, 'staff.read')
    or app.is_super_admin()
  );
create policy tenant_members_owner_insert on public.tenant_members for insert to authenticated
  with check (app.is_tenant_owner(tenant_id) or app.is_super_admin());
create policy tenant_members_owner_update on public.tenant_members for update to authenticated
  using (app.is_tenant_owner(tenant_id) or app.is_super_admin())
  with check (app.is_tenant_owner(tenant_id) or app.is_super_admin());
create policy tenant_members_owner_delete on public.tenant_members for delete to authenticated
  using (app.is_tenant_owner(tenant_id) or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Subscriptions & overrides: tenants read their own; platform admins write.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.tenant_subscriptions to authenticated;
create policy tenant_subscriptions_read on public.tenant_subscriptions for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.is_super_admin());
create policy tenant_subscriptions_admin_insert on public.tenant_subscriptions for insert to authenticated with check (app.is_super_admin());
create policy tenant_subscriptions_admin_update on public.tenant_subscriptions for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy tenant_subscriptions_admin_delete on public.tenant_subscriptions for delete to authenticated using (app.is_super_admin());

grant select, insert, update, delete on public.tenant_feature_overrides to authenticated;
create policy tenant_feature_overrides_read on public.tenant_feature_overrides for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.is_super_admin());
create policy tenant_feature_overrides_admin_insert on public.tenant_feature_overrides for insert to authenticated with check (app.is_super_admin());
create policy tenant_feature_overrides_admin_update on public.tenant_feature_overrides for update to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy tenant_feature_overrides_admin_delete on public.tenant_feature_overrides for delete to authenticated using (app.is_super_admin());

-- =============================================================================
-- Public RPCs
-- =============================================================================

-- Storefront resolution: hostname (custom domain) or slug (platform subdomain)
-- → public tenant profile + storefront configuration.
-- Returns NULL for unknown or closed tenants. Suspended/onboarding tenants
-- return only the minimum needed to render an "unavailable" page.
create or replace function public.resolve_storefront(p_hostname text default null, p_slug text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  t   public.tenants%rowtype;
  sc  public.storefront_configs%rowtype;
  dom text;
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

-- The current user's tenant memberships (for the admin tenant switcher).
create or replace function public.my_memberships()
returns table (
  tenant_id     uuid,
  slug          text,
  business_name text,
  tenant_status text,
  role_key      text,
  role_name     jsonb,
  logo_path     text
)
language sql stable security definer
set search_path = ''
as $$
  select t.id, t.slug, t.business_name, t.status, r.key, r.name, t.logo_path
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  join public.roles r on r.id = m.role_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and t.status <> 'closed'
  order by t.business_name
$$;

revoke all on function public.my_memberships() from public;
grant execute on function public.my_memberships() to authenticated;

-- Admin context for one tenant: the caller's role, permissions and the
-- tenant's enabled features. Raises for non-members (unless platform admin).
create or replace function public.tenant_admin_context(p_tenant uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  role_row    public.roles%rowtype;
  perms       text[];
  feats       jsonb;
  super_admin boolean := app.is_super_admin();
begin
  select r.* into role_row
  from public.tenant_members m join public.roles r on r.id = m.role_id
  where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.status = 'active';

  if not found and not super_admin then
    raise exception 'Not a member of this tenant' using errcode = '42501';
  end if;

  if (role_row.is_system and role_row.key = 'tenant_owner') or (role_row.id is null and super_admin) then
    select array_agg(p.key order by p.key) into perms from public.permissions p;
  else
    select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}')
      into perms from public.role_permissions rp where rp.role_id = role_row.id;
  end if;

  select coalesce(jsonb_object_agg(f.key, jsonb_build_object(
           'enabled', app.tenant_has_feature(p_tenant, f.key),
           'limit',   app.tenant_feature_limit(p_tenant, f.key))), '{}'::jsonb)
    into feats from public.features f;

  return jsonb_build_object(
    'tenant_id', p_tenant,
    'role_key', role_row.key,
    'is_platform_admin', super_admin,
    'permissions', to_jsonb(perms),
    'features', feats
  );
end;
$$;

revoke all on function public.tenant_admin_context(uuid) from public;
grant execute on function public.tenant_admin_context(uuid) to authenticated;
