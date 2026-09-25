-- =============================================================================
-- 0005 · Audit log
-- Row-level audit triggers on sensitive administrative tables, plus
-- app.write_audit() for service-level events (logins, exports, payments…).
-- Audit rows cannot be written, changed or deleted by API roles.
-- =============================================================================

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  tenant_id     uuid references public.tenants (id) on delete set null,
  actor_user_id uuid,
  actor_role    text not null default current_user,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  diff          jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_tenant_created on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_actor on public.audit_logs (actor_user_id, created_at desc);

alter table public.audit_logs enable row level security;

grant select on public.audit_logs to authenticated;
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (
    (tenant_id is not null and app.has_permission(tenant_id, 'audit.read'))
    or app.is_super_admin()
  );

-- Service-level audit entries (called from server code with service_role).
create or replace function app.write_audit(
  p_tenant      uuid,
  p_actor       uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_diff        jsonb default '{}'::jsonb,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, diff, ip, user_agent)
  values (p_tenant, p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_diff, '{}'::jsonb), p_ip, left(p_user_agent, 400));
$$;

revoke all on function app.write_audit(uuid, uuid, text, text, text, jsonb, inet, text) from public;
grant execute on function app.write_audit(uuid, uuid, text, text, text, jsonb, inet, text) to service_role;

-- Generic row-change audit trigger. Records only changed columns on UPDATE.
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row   jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data  jsonb := coalesce(new_row, old_row);
  changes   jsonb := '{}'::jsonb;
  k         text;
  tenant    uuid;
  entity    text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_row) loop
      if k <> 'updated_at' and (old_row -> k) is distinct from (new_row -> k) then
        changes := changes || jsonb_build_object(k, jsonb_build_object('old', old_row -> k, 'new', new_row -> k));
      end if;
    end loop;
    if changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    changes := jsonb_build_object('new', new_row);
  else
    changes := jsonb_build_object('old', old_row);
  end if;

  tenant := case
    when tg_table_name = 'tenants' then (row_data ->> 'id')::uuid
    when row_data ? 'tenant_id' then (row_data ->> 'tenant_id')::uuid
  end;

  entity := coalesce(
    row_data ->> 'id',
    case when row_data ? 'tenant_id' and row_data ? 'user_id' then (row_data ->> 'tenant_id') || ':' || (row_data ->> 'user_id') end,
    row_data ->> 'tenant_id',
    row_data ->> 'user_id'
  );

  -- A deleted tenant cannot be referenced any more.
  if tg_op = 'DELETE' and tg_table_name = 'tenants' then
    tenant := null;
  elsif tenant is not null and not exists (select 1 from public.tenants where id = tenant) then
    tenant := null;
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, diff)
  values (tenant, (select auth.uid()), current_user, lower(tg_op), tg_table_name, entity, changes);

  return coalesce(new, old);
end;
$$;

create trigger audit_tenants                  after insert or update or delete on public.tenants                  for each row execute function app.audit_row_change();
create trigger audit_tenant_domains           after insert or update or delete on public.tenant_domains           for each row execute function app.audit_row_change();
create trigger audit_tenant_settings          after update                     on public.tenant_settings          for each row execute function app.audit_row_change();
create trigger audit_storefront_configs       after update                     on public.storefront_configs       for each row execute function app.audit_row_change();
create trigger audit_branches                 after insert or update or delete on public.branches                 for each row execute function app.audit_row_change();
create trigger audit_tenant_members           after insert or update or delete on public.tenant_members           for each row execute function app.audit_row_change();
create trigger audit_roles                    after insert or update or delete on public.roles                    for each row execute function app.audit_row_change();
create trigger audit_role_permissions         after insert or delete           on public.role_permissions         for each row execute function app.audit_row_change();
create trigger audit_platform_admins          after insert or update or delete on public.platform_admins          for each row execute function app.audit_row_change();
create trigger audit_plans                    after insert or update or delete on public.plans                    for each row execute function app.audit_row_change();
create trigger audit_plan_features            after insert or update or delete on public.plan_features            for each row execute function app.audit_row_change();
create trigger audit_tenant_subscriptions     after insert or update or delete on public.tenant_subscriptions     for each row execute function app.audit_row_change();
create trigger audit_tenant_feature_overrides after insert or update or delete on public.tenant_feature_overrides for each row execute function app.audit_row_change();
