-- =============================================================================
-- 0007 · Performance advisor follow-ups
-- Covering indexes for foreign keys and a single SELECT policy on plans.
-- =============================================================================

create index if not exists plan_features_feature_key       on public.plan_features (feature_key);
create index if not exists plans_currency                  on public.plans (currency);
create index if not exists role_permissions_permission_key on public.role_permissions (permission_key);
create index if not exists tenant_feature_overrides_feature on public.tenant_feature_overrides (feature_key);
create index if not exists tenant_members_tenant_branch    on public.tenant_members (tenant_id, branch_id);
create index if not exists tenant_subscriptions_plan       on public.tenant_subscriptions (plan_id);
create index if not exists tenants_currency                on public.tenants (currency);

-- One permissive SELECT policy per role instead of two OR-ed policies.
drop policy plans_read_public on public.plans;
drop policy plans_read_own on public.plans;

create policy plans_read_anon on public.plans for select to anon
  using (is_public and is_active);

create policy plans_read on public.plans for select to authenticated
  using (
    (is_public and is_active)
    or app.is_super_admin()
    or exists (
      select 1 from public.tenant_subscriptions s
      where s.plan_id = plans.id and app.is_tenant_member(s.tenant_id)
    )
  );
