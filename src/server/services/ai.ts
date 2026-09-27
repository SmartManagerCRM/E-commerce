import "server-only";

import { aiConfigured } from "@/server/ai";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Staff-facing AI operations: settings and usage. The assistant itself
 * (conversations, tool calls, model requests) is Phase 2's own module —
 * this is the foundation Phase 2 will build on: entitlements, tenant
 * config, and the usage a tenant/Super Admin can already see. Every
 * function wraps a permission-checked database function or an RLS-scoped
 * read, the same boundary every other service module uses.
 */
export type AISettings = {
  active: boolean;
  assistantName: string;
  greeting: string | null;
  tone: "professional" | "friendly" | "premium" | "casual" | "minimal";
  orderingEnabled: boolean;
  copilotEnabled: boolean;
};

export async function getAISettings(context: TenantAdminContext): Promise<AISettings> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("ai_settings", { p_tenant: context.tenant.id });
  if (error || !data) {
    return { active: false, assistantName: "Assistant", greeting: null, tone: "friendly", orderingEnabled: false, copilotEnabled: false };
  }
  const row = data as {
    active: boolean;
    assistant_name: string;
    greeting: string | null;
    tone: AISettings["tone"];
    ordering_enabled: boolean;
    copilot_enabled: boolean;
  };
  return {
    active: row.active,
    assistantName: row.assistant_name,
    greeting: row.greeting,
    tone: row.tone,
    orderingEnabled: row.ordering_enabled,
    copilotEnabled: row.copilot_enabled,
  };
}

/** Whether the platform's own AI provider account is configured at all (separate from any tenant's entitlement). */
export function aiProviderConfigured(): boolean {
  return aiConfigured();
}

export type AIUsageSummary = {
  periodStart: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  monthlyCreditLimit: number | null;
};

export async function getAIUsageSummary(context: TenantAdminContext): Promise<AIUsageSummary> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("ai_usage_summary", { p_tenant: context.tenant.id });
  if (error || !data) {
    return { periodStart: new Date().toISOString().slice(0, 10), requests: 0, inputTokens: 0, outputTokens: 0, monthlyCreditLimit: null };
  }
  const row = data as {
    period_start: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    monthly_credit_limit: number | null;
  };
  return {
    periodStart: row.period_start,
    requests: row.requests,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    monthlyCreditLimit: row.monthly_credit_limit,
  };
}
