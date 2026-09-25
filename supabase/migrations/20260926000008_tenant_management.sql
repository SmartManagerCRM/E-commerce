-- =============================================================================
-- 0008 · Phase 2 — tenant management
--   * staff invitations (token hashed at rest, entitlement-limited)
--   * atomic platform operations (create tenant, change plan)
--   * custom-domain requests + DNS verification + hosting connection flag
--   * branding storage bucket with per-tenant folder policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function app.try_uuid(value text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function app.try_uuid(text) to anon, authenticated, service_role;

create or replace function app.hash_token(token text)
returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex') $$;

revoke all on function app.hash_token(text) from public;

-- -----------------------------------------------------------------------------
-- Staff invitations
-- -----------------------------------------------------------------------------
create table public.tenant_invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  email       extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id     uuid not null references public.roles (id) on delete cascade,
  token_hash  text not null unique,
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index tenant_invitations_tenant on public.tenant_invitations (tenant_id, created_at desc);
create index tenant_invitations_role on public.tenant_invitations (role_id);
create index tenant_invitations_invited_by on public.tenant_invitations (invited_by);
create index tenant_invitations_accepted_by on public.tenant_invitations (accepted_by);
-- One open invitation per email per tenant.
create unique index tenant_invitations_one_open
  on public.tenant_invitations (tenant_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.tenant_invitations enable row level security;

-- Staff with staff.read see their tenant's invitations (token hashes are
-- excluded by column privileges). Writes only through the functions below.
grant select (id, tenant_id, email, role_id, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.tenant_invitations to authenticated;
create policy tenant_invitations_read on public.tenant_invitations for select to authenticated
  using (app.has_permission(tenant_id, 'staff.read') or app.is_super_admin());

-- Active member count + pending invitations, for the max_staff entitlement.
create or replace function app.staff_seats_used(p_tenant uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select (select count(*) from public.tenant_members m where m.tenant_id = p_tenant and m.status <> 'disabled')::int
       + (select count(*) from public.tenant_invitations i
           where i.tenant_id = p_tenant and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())::int
$$;

revoke all on function app.staff_seats_used(uuid) from public;

create trigger audit_tenant_invitations after insert or update or delete on public.tenant_invitations
  for each row execute function app.audit_row_change();

-- Internal: create an invitation and return the raw token (shown once).
create or replace function app.create_invitation(p_tenant uuid, p_email text, p_role_key text, p_invited_by uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_role  uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_limit integer;
begin
  select id into v_role from public.roles
  where key = p_role_key and (is_system or tenant_id = p_tenant);
  if v_role is null then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.tenant_members m join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = p.id
    where m.tenant_id = p_tenant and lower(u.email) = lower(p_email) and m.status = 'active'
  ) then
    raise exception 'This person is already a member' using errcode = '23505';
  end if;

  v_limit := app.tenant_feature_limit(p_tenant, 'max_staff');
  if v_limit is not null and app.staff_seats_used(p_tenant) >= v_limit then
    raise exception 'Staff limit of your plan reached' using errcode = '53400';
  end if;

  -- Replace any open invitation for the same email.
  update public.tenant_invitations set revoked_at = now()
  where tenant_id = p_tenant and email = p_email and accepted_at is null and revoked_at is null;

  insert into public.tenant_invitations (tenant_id, email, role_id, token_hash, invited_by)
  values (p_tenant, lower(p_email), v_role, app.hash_token(v_token), p_invited_by);

  return v_token;
end;
$$;

revoke all on function app.create_invitation(uuid, text, text, uuid) from public;

-- Tenant owners (and platform admins) invite staff. Only owners can invite
-- another owner, so delegated admins cannot escalate.
create or replace function public.invite_member(p_tenant uuid, p_email text, p_role_key text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (app.is_tenant_owner(p_tenant) or app.is_super_admin()
          or (app.has_permission(p_tenant, 'staff.write') and p_role_key <> 'tenant_owner')) then
    raise exception 'Not allowed to invite members' using errcode = '42501';
  end if;
  if p_role_key = 'tenant_owner' and not (app.is_tenant_owner(p_tenant) or app.is_super_admin()) then
    raise exception 'Only owners can invite owners' using errcode = '42501';
  end if;
  return app.create_invitation(p_tenant, p_email, p_role_key, (select auth.uid()));
end;
$$;

revoke all on function public.invite_member(uuid, text, text) from public;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.tenant_invitations where id = p_invitation;
  if v_tenant is null or not (app.has_permission(v_tenant, 'staff.write') or app.is_super_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.tenant_invitations set revoked_at = now()
  where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

revoke all on function public.revoke_invitation(uuid) from public;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- Public preview of an invitation for the acceptance page. The 256-bit token
-- is the credential; nothing is returned for unknown tokens.
create or replace function public.get_invitation(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', i.email::text,
    'business_name', t.business_name,
    'tenant_slug', t.slug,
    'role_key', r.key,
    'role_name', r.name,
    'expired', i.expires_at <= now(),
    'accepted', i.accepted_at is not null,
    'revoked', i.revoked_at is not null
  )
  from public.tenant_invitations i
  join public.tenants t on t.id = i.tenant_id
  join public.roles r on r.id = i.role_id
  where i.token_hash = app.hash_token(p_token)
    and t.status <> 'closed'
$$;

revoke all on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;

-- Accepts an invitation for the signed-in user; their email must match.
create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  inv     public.tenant_invitations%rowtype;
  v_email text;
  v_slug  text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into inv from public.tenant_invitations
  where token_hash = app.hash_token(p_token) for update;

  if not found or inv.revoked_at is not null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Invitation already used' using errcode = '23505';
  end if;
  if inv.expires_at <= now() then
    raise exception 'Invitation expired' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = (select auth.uid());
  if lower(v_email) is distinct from lower(inv.email::text) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role_id, status)
  values (inv.tenant_id, (select auth.uid()), inv.role_id, 'active')
  on conflict (tenant_id, user_id) do update set role_id = excluded.role_id, status = 'active';

  update public.tenant_invitations set accepted_at = now(), accepted_by = (select auth.uid())
  where id = inv.id;

  select slug into v_slug from public.tenants where id = inv.tenant_id;
  return v_slug;
end;
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- Tenant member management by owners goes through the existing RLS policies
-- (tenant_members_owner_update/delete). Profiles of co-members are visible to
-- staff.read through profiles_read. Emails live in auth.users, so expose them
-- to staff.read through a function.
create or replace function public.tenant_staff(p_tenant uuid)
returns table (
  user_id    uuid,
  email      text,
  full_name  text,
  role_key   text,
  role_name  jsonb,
  status     text,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (app.has_permission(p_tenant, 'staff.read') or app.is_super_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, p.full_name, r.key, r.name, m.status, m.created_at
    from public.tenant_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    join public.roles r on r.id = m.role_id
    where m.tenant_id = p_tenant
    order by r.rank desc, m.created_at;
end;
$$;

revoke all on function public.tenant_staff(uuid) from public;
grant execute on function public.tenant_staff(uuid) to authenticated;

-- Owners may change roles / disable members but never promote to owner
-- unless they are an owner themselves (already guaranteed by the policy:
-- only owners can update memberships) — and a max_staff check applies when
-- re-enabling a disabled member.
create or replace function app.guard_member_reactivation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  if old.status = 'disabled' and new.status = 'active' then
    v_limit := app.tenant_feature_limit(new.tenant_id, 'max_staff');
    if v_limit is not null and app.staff_seats_used(new.tenant_id) >= v_limit then
      raise exception 'Staff limit of your plan reached' using errcode = '53400';
    end if;
  end if;
  return new;
end;
$$;

create trigger tenant_members_guard_reactivation before update of status on public.tenant_members
  for each row execute function app.guard_member_reactivation();

-- -----------------------------------------------------------------------------
-- Platform operations (Super Admin)
-- -----------------------------------------------------------------------------
create or replace function public.platform_create_tenant(
  p_slug              text,
  p_business_name     text,
  p_business_type     text,
  p_currency          text,
  p_timezone          text,
  p_default_language  text,
  p_enabled_languages text[],
  p_country           text,
  p_city              text,
  p_plan_key          text,
  p_owner_email       text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_plan   uuid;
  v_token  text;
begin
  if not app.is_super_admin() then
    raise exception 'Platform administrators only' using errcode = '42501';
  end if;

  select id into v_plan from public.plans where key = p_plan_key and is_active;
  if v_plan is null then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;

  insert into public.tenants (slug, business_name, business_type, status, currency, timezone,
                              default_language, enabled_languages, country, city)
  values (lower(p_slug), p_business_name, p_business_type, 'onboarding', upper(p_currency), p_timezone,
          p_default_language, p_enabled_languages, nullif(upper(p_country), ''), nullif(p_city, ''))
  returning id into v_tenant;

  insert into public.tenant_subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (v_tenant, v_plan, 'trialing', now() + interval '14 days');

  v_token := app.create_invitation(v_tenant, p_owner_email, 'tenant_owner', (select auth.uid()));

  return jsonb_build_object('tenant_id', v_tenant, 'invitation_token', v_token);
end;
$$;

revoke all on function public.platform_create_tenant(text, text, text, text, text, text, text[], text, text, text, text) from public;
grant execute on function public.platform_create_tenant(text, text, text, text, text, text, text[], text, text, text, text) to authenticated;

create or replace function public.platform_set_plan(p_tenant uuid, p_plan_key text, p_status text default 'active')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  if not app.is_super_admin() then
    raise exception 'Platform administrators only' using errcode = '42501';
  end if;
  if p_status not in ('trialing', 'active', 'past_due') then
    raise exception 'Invalid subscription status' using errcode = '22023';
  end if;
  select id into v_plan from public.plans where key = p_plan_key;
  if v_plan is null then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;

  update public.tenant_subscriptions set status = 'cancelled', cancel_at = now()
  where tenant_id = p_tenant and status in ('trialing', 'active', 'past_due');

  insert into public.tenant_subscriptions (tenant_id, plan_id, status)
  values (p_tenant, v_plan, p_status);
end;
$$;

revoke all on function public.platform_set_plan(uuid, text, text) from public;
grant execute on function public.platform_set_plan(uuid, text, text) to authenticated;

-- Platform admins can issue a fresh owner invitation (e.g. lost link).
create or replace function public.platform_invite_owner(p_tenant uuid, p_email text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.is_super_admin() then
    raise exception 'Platform administrators only' using errcode = '42501';
  end if;
  return app.create_invitation(p_tenant, p_email, 'tenant_owner', (select auth.uid()));
end;
$$;

revoke all on function public.platform_invite_owner(uuid, text) from public;
grant execute on function public.platform_invite_owner(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Custom domains
--   request  → tenant (settings.write + custom_domain entitlement), unverified
--   verify   → server checks the DNS TXT record, then sets verified_at with
--              the service role (tenants can never set it themselves)
--   connect  → platform admin confirms the domain is attached on the hosting
--              panel (Hostinger hPanel) — hosting_connected_at
-- -----------------------------------------------------------------------------
alter table public.tenant_domains
  add column hosting_connected_at timestamptz,
  add column last_checked_at      timestamptz,
  add column last_check_error     text;

create policy tenant_domains_member_request on public.tenant_domains for insert to authenticated
  with check (
    app.has_permission(tenant_id, 'settings.write')
    and app.tenant_has_feature(tenant_id, 'custom_domain')
    and verified_at is null
    and hosting_connected_at is null
    and not is_primary
  );

create policy tenant_domains_member_delete on public.tenant_domains for delete to authenticated
  using (app.has_permission(tenant_id, 'settings.write'));

-- Verified domains only; exactly one primary per tenant.
create or replace function public.set_primary_domain(p_domain uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  d public.tenant_domains%rowtype;
begin
  select * into d from public.tenant_domains where id = p_domain;
  if not found or not (app.has_permission(d.tenant_id, 'settings.write') or app.is_super_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if d.verified_at is null then
    raise exception 'Verify the domain first' using errcode = '22023';
  end if;
  update public.tenant_domains set is_primary = false where tenant_id = d.tenant_id and is_primary;
  update public.tenant_domains set is_primary = true where id = p_domain;
end;
$$;

revoke all on function public.set_primary_domain(uuid) from public;
grant execute on function public.set_primary_domain(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Tenant profile: owners/admins edit through settings.write; the guard
-- trigger from 0004 still protects slug, status and currency.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Storage: public branding/media bucket, one folder per tenant id
--   tenant-public/<tenant_id>/branding/<file>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-public', 'tenant-public', true, 5 * 1024 * 1024,
        array['image/webp', 'image/png', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy tenant_public_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-public'
    and (app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'media.write')
         or app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'appearance.write'))
  );

create policy tenant_public_update on storage.objects for update to authenticated
  using (
    bucket_id = 'tenant-public'
    and (app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'media.write')
         or app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'appearance.write'))
  )
  with check (
    bucket_id = 'tenant-public'
    and (app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'media.write')
         or app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'appearance.write'))
  );

create policy tenant_public_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-public'
    and (app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'media.write')
         or app.has_permission(app.try_uuid((storage.foldername(name))[1]), 'appearance.write'))
  );

-- Listing (select) is limited to the tenant's own staff; public files are
-- still downloadable by URL because the bucket is public.
create policy tenant_public_select on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-public'
    and app.is_tenant_member(app.try_uuid((storage.foldername(name))[1]))
  );

-- Records a server-side DNS verification result. Only the service role can
-- call it (after the application checked permissions and DNS); the acting
-- user is attributed in the audit log.
create or replace function public.record_domain_check(p_domain uuid, p_actor uuid, p_verified boolean, p_error text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_actor::text, ''), true);
  update public.tenant_domains
     set last_checked_at = now(),
         last_check_error = case when p_verified then null else left(p_error, 200) end,
         verified_at = case when p_verified then coalesce(verified_at, now()) else verified_at end
   where id = p_domain;
end;
$$;

revoke all on function public.record_domain_check(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_domain_check(uuid, uuid, boolean, text) to service_role;
