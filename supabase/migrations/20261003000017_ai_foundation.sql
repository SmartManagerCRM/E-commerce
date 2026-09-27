-- =============================================================================
-- 0017 · AI Operating System — Phase 1 (foundation)
--
-- Scaffolding only: entitlements, tenant AI settings, usage metering, and the
-- conversation/message/tool-call storage a future ordering assistant and
-- business copilot will write to. No model is called from here yet — this
-- migration adds no behavior, only the boundary later phases plug into.
--
-- * AI is metered against the PLATFORM's own provider account (like the
--   platform's own Resend account for email), not a per-tenant BYO key like
--   Moyasar — so there is no per-tenant secret to store here. The provider
--   API key lives in a server environment variable only.
-- * Entitlements reuse the existing features/plan_features/tenant_feature_
--   overrides engine (the same one every other module's plan gating already
--   uses) rather than a parallel bespoke table — `ai_assistant` already
--   exists as the master gate; this adds the finer-grained capability keys
--   the spec calls for underneath it.
-- * Every AI-owned table is tenant-scoped with RLS, gated on the existing
--   `ai.use` permission — there is no separate, weaker AI-only auth path.
-- =============================================================================

insert into public.features (key, module, kind, name, sort_order) values
  ('ai_ordering',  'ai', 'boolean', '{"en":"AI ordering assistant","fr":"Assistant IA de commande","ar":"مساعد الطلب الذكي"}', 191),
  ('ai_copilot',   'ai', 'boolean', '{"en":"AI business copilot","fr":"Copilote IA","ar":"مساعد الأعمال الذكي"}', 192),
  ('ai_marketing', 'ai', 'boolean', '{"en":"AI marketing engine","fr":"Moteur marketing IA","ar":"محرك التسويق الذكي"}', 193),
  ('ai_operations','ai', 'boolean', '{"en":"AI operations intelligence","fr":"Intelligence opérationnelle IA","ar":"ذكاء العمليات"}', 194),
  ('ai_knowledge', 'ai', 'boolean', '{"en":"AI knowledge base","fr":"Base de connaissances IA","ar":"قاعدة المعرفة الذكية"}', 195),
  ('ai_monthly_credits', 'ai', 'limit', '{"en":"AI credits per month","fr":"Crédits IA par mois","ar":"رصيد الذكاء الاصطناعي الشهري"}', 900)
on conflict (key) do nothing;

-- Professional already has the ai_assistant master gate; give it the first
-- two capabilities (ordering, copilot — the MVP 1/MVP 2 the spec names) plus
-- a starter credit allowance. Marketing/operations/knowledge stay off until
-- those phases exist, same as booking's own feature was added ahead of its
-- phase and left off everywhere until Phase 8 built it.
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, f.key, true, case f.key when 'ai_monthly_credits' then 2000 else null end
from public.plans p
cross join (values ('ai_ordering'), ('ai_copilot'), ('ai_monthly_credits')) f(key)
where p.key = 'professional'
on conflict (plan_id, feature_key) do nothing;

-- -----------------------------------------------------------------------------
-- tenant_settings.ai = { active, assistant_name, greeting, tone }
-- -----------------------------------------------------------------------------
alter table public.tenant_settings
  add column ai jsonb not null default '{}'::jsonb check (jsonb_typeof(ai) = 'object');

create or replace function app.validate_ai_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai ? 'active' and jsonb_typeof(new.ai -> 'active') <> 'boolean' then
    raise exception 'ai.active must be a boolean' using errcode = '23514';
  end if;
  if new.ai ? 'assistant_name' and (jsonb_typeof(new.ai -> 'assistant_name') <> 'string'
       or length(new.ai ->> 'assistant_name') > 40) then
    raise exception 'ai.assistant_name is invalid' using errcode = '23514';
  end if;
  if new.ai ? 'greeting' and (jsonb_typeof(new.ai -> 'greeting') <> 'string' or length(new.ai ->> 'greeting') > 300) then
    raise exception 'ai.greeting is invalid' using errcode = '23514';
  end if;
  if new.ai ? 'tone' and (jsonb_typeof(new.ai -> 'tone') <> 'string'
       or (new.ai ->> 'tone') not in ('professional', 'friendly', 'premium', 'casual', 'minimal')) then
    raise exception 'ai.tone is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tenant_settings_validate_ai before insert or update of ai on public.tenant_settings
  for each row execute function app.validate_ai_settings();

-- Normalised settings with safe defaults; `active` also requires the tenant's
-- plan to include the ai_assistant master feature, the same "tenant choice
-- AND plan entitlement" pattern booking/loyalty already use.
create or replace function public.ai_settings(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', coalesce((s.ai ->> 'active')::boolean, false) and app.tenant_has_feature(p_tenant, 'ai_assistant'),
    'assistant_name', coalesce(s.ai ->> 'assistant_name', 'Assistant'),
    'greeting', s.ai ->> 'greeting',
    'tone', coalesce(s.ai ->> 'tone', 'friendly'),
    'ordering_enabled', app.tenant_has_feature(p_tenant, 'ai_ordering'),
    'copilot_enabled', app.tenant_has_feature(p_tenant, 'ai_copilot')
  )
  from public.tenant_settings s
  where s.tenant_id = p_tenant
$$;

revoke all on function public.ai_settings(uuid) from public;
grant execute on function public.ai_settings(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Conversations, messages and tool calls. Written by later phases (the
-- ordering assistant, the copilot); this migration only creates the table
-- and its access rules so that work has somewhere safe to land.
-- -----------------------------------------------------------------------------
create table public.ai_conversations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  channel      text not null check (channel in ('storefront', 'staff')),
  feature_key  text not null references public.features (key),
  customer_id  uuid,
  user_id      uuid,
  locale       text not null default 'en' check (locale in ('en', 'fr', 'ar')),
  order_id     uuid,
  status       text not null default 'open' check (status in ('open', 'ended', 'handed_off')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete set null (order_id)
);

create index ai_conversations_tenant on public.ai_conversations (tenant_id, started_at desc);

alter table public.ai_conversations enable row level security;
grant select on public.ai_conversations to authenticated;
create policy ai_conversations_read on public.ai_conversations for select to authenticated
  using (app.has_permission(tenant_id, 'ai.use') or app.is_super_admin());
-- No direct writes: a service-role function creates/updates conversations
-- (added when Phase 2 builds the assistant that actually holds one).

create table public.ai_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content         text not null check (length(content) <= 8000),
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, conversation_id) references public.ai_conversations (tenant_id, id) on delete cascade
);

create index ai_messages_conversation on public.ai_messages (conversation_id, created_at);

alter table public.ai_messages enable row level security;
grant select on public.ai_messages to authenticated;
create policy ai_messages_read on public.ai_messages for select to authenticated
  using (app.has_permission(tenant_id, 'ai.use') or app.is_super_admin());

create table public.ai_tool_calls (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  tool_name       text not null check (length(tool_name) <= 60),
  arguments       jsonb not null default '{}'::jsonb,
  result          jsonb,
  status          text not null default 'ok' check (status in ('ok', 'error', 'denied')),
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, conversation_id) references public.ai_conversations (tenant_id, id) on delete cascade
);

create index ai_tool_calls_conversation on public.ai_tool_calls (conversation_id, created_at);

alter table public.ai_tool_calls enable row level security;
grant select on public.ai_tool_calls to authenticated;
create policy ai_tool_calls_read on public.ai_tool_calls for select to authenticated
  using (app.has_permission(tenant_id, 'ai.use') or app.is_super_admin());

-- -----------------------------------------------------------------------------
-- Usage metering: one row per tenant per calendar month, incremented by the
-- service-role each time a model call completes. Reads are how a tenant sees
-- "AI Usage" and how Super Admin sees per-tenant "AI Cost" (§42/§45).
-- -----------------------------------------------------------------------------
create table public.ai_usage (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  period_start  date not null,
  requests      integer not null default 0 check (requests >= 0),
  input_tokens  bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  primary key (tenant_id, period_start)
);

alter table public.ai_usage enable row level security;
grant select on public.ai_usage to authenticated;
create policy ai_usage_read on public.ai_usage for select to authenticated
  using (app.has_permission(tenant_id, 'ai.use') or app.is_super_admin());
-- No direct writes: recorded by record_ai_usage() below (service_role only).

-- This month's usage vs. the plan's included credits (null = unlimited/not set).
create or replace function public.ai_usage_summary(p_tenant uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'period_start', date_trunc('month', now())::date,
    'requests', coalesce(u.requests, 0),
    'input_tokens', coalesce(u.input_tokens, 0),
    'output_tokens', coalesce(u.output_tokens, 0),
    'monthly_credit_limit', app.tenant_feature_limit(p_tenant, 'ai_monthly_credits')
  )
  from (select 1) x
  left join public.ai_usage u on u.tenant_id = p_tenant and u.period_start = date_trunc('month', now())::date
$$;

revoke all on function public.ai_usage_summary(uuid) from public;
grant execute on function public.ai_usage_summary(uuid) to authenticated, service_role;

-- Records one model call's usage against the tenant's current month. Called
-- by server AI code after each provider response — never by the client.
create or replace function public.record_ai_usage(p_tenant uuid, p_input_tokens integer, p_output_tokens integer)
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into public.ai_usage (tenant_id, period_start, requests, input_tokens, output_tokens)
  values (p_tenant, date_trunc('month', now())::date, 1, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0))
  on conflict (tenant_id, period_start) do update set
    requests = public.ai_usage.requests + 1,
    input_tokens = public.ai_usage.input_tokens + greatest(p_input_tokens, 0),
    output_tokens = public.ai_usage.output_tokens + greatest(p_output_tokens, 0)
$$;

revoke all on function public.record_ai_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, integer, integer) to service_role;
