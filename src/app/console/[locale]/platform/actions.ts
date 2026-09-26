"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { formDataToObject } from "@/lib/form-data";
import { emailSchema, fieldErrorsFrom, type FormState } from "@/lib/validation/common";
import { createTenantSchema } from "@/lib/validation/tenant";
import { platformActionUser } from "@/server/auth/platform";
import { notifyOwnerInvited } from "@/server/notifications/notify";
import { createUserClient } from "@/server/supabase/clients";
import { invalidateTenantCache } from "@/server/tenant/resolver";
import { consoleOrigin } from "@/server/tenant/urls";

const DETAIL = "/console/[locale]/platform/tenants/[id]";
const FORBIDDEN: FormState = { status: "error", error: "forbidden" };

async function inviteLink(token: string) {
  return `${consoleOrigin()}/${await getLocale()}/invite/${token}`;
}

export async function createTenant(
  _prev: FormState<{ tenantId: string; link: string }>,
  formData: FormData,
): Promise<FormState<{ tenantId: string; link: string }>> {
  if (!(await platformActionUser())) return { status: "error", error: "forbidden" };
  const parsed = createTenantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
  const v = parsed.data;

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("platform_create_tenant", {
    p_slug: v.slug,
    p_business_name: v.business_name,
    p_business_type: v.business_type,
    p_currency: v.currency,
    p_timezone: v.timezone,
    p_default_language: v.default_language,
    p_enabled_languages: v.enabled_languages,
    p_country: v.country,
    p_city: v.city,
    p_plan_key: v.plan_key,
    p_owner_email: v.owner_email,
  });
  if (error) {
    const byCode: Record<string, string> = {
      "23505": "slugTaken",
      "23514": "invalid",
      "22023": "invalid",
      "23503": "invalid",
    };
    return { status: "error", error: byCode[error.code] ?? "generic" };
  }
  const result = data as { tenant_id: string; invitation_token: string };
  revalidatePath("/console/[locale]/platform", "page");
  const link = await inviteLink(result.invitation_token);
  await notifyOwnerInvited({
    tenantId: result.tenant_id,
    businessName: v.business_name,
    email: v.owner_email,
    inviteUrl: link,
  });
  return { status: "success", message: "tenantCreated", data: { tenantId: result.tenant_id, link } };
}

const statusSchema = z.enum(["onboarding", "active", "suspended", "closed"]);

export async function setTenantStatus(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await platformActionUser())) return FORBIDDEN;
  const status = statusSchema.safeParse(formData.get("status"));
  if (!status.success) return { status: "error", error: "invalid" };
  const supabase = await createUserClient();
  const { error } = await supabase.from("tenants").update({ status: status.data }).eq("id", tenantId);
  if (error) return { status: "error", error: "generic" };
  invalidateTenantCache();
  revalidatePath(DETAIL, "page");
  return { status: "success", message: "saved" };
}

export async function setTenantPlan(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await platformActionUser())) return FORBIDDEN;
  const input = z
    .object({ plan_key: z.string().min(1), subscription_status: z.enum(["trialing", "active", "past_due"]) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "error", error: "invalid" };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("platform_set_plan", {
    p_tenant: tenantId,
    p_plan_key: input.data.plan_key,
    p_status: input.data.subscription_status,
  });
  if (error) return { status: "error", error: "generic" };
  revalidatePath(DETAIL, "page");
  return { status: "success", message: "saved" };
}

export async function setFeatureOverride(tenantId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await platformActionUser())) return FORBIDDEN;
  const input = z
    .object({
      feature_key: z.string().regex(/^[a-z_]{2,60}$/),
      mode: z.enum(["inherit", "enabled", "disabled"]),
      limit_value: z
        .string()
        .trim()
        .regex(/^\d*$/)
        .transform((v) => (v === "" ? null : Number(v))),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "error", error: "invalid" };
  const { feature_key, mode, limit_value } = input.data;

  const supabase = await createUserClient();
  const { error } =
    mode === "inherit"
      ? await supabase
          .from("tenant_feature_overrides")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("feature_key", feature_key)
      : await supabase.from("tenant_feature_overrides").upsert({
          tenant_id: tenantId,
          feature_key,
          enabled: mode === "enabled",
          limit_value,
        });
  if (error) return { status: "error", error: "generic" };
  revalidatePath(DETAIL, "page");
  return { status: "success", message: "saved" };
}

export async function inviteOwner(
  tenantId: string,
  _prev: FormState<{ link: string }>,
  formData: FormData,
): Promise<FormState<{ link: string }>> {
  if (!(await platformActionUser())) return { status: "error", error: "forbidden" };
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { status: "error", error: "invalid" };
  const supabase = await createUserClient();
  const { data: token, error } = await supabase.rpc("platform_invite_owner", {
    p_tenant: tenantId,
    p_email: email.data,
  });
  if (error || !token) {
    return {
      status: "error",
      error: error?.code === "23505" ? "alreadyMember" : error?.code === "53400" ? "staffLimit" : "generic",
    };
  }
  revalidatePath(DETAIL, "page");
  const link = await inviteLink(token);
  const { data: tenant } = await supabase.from("tenants").select("business_name").eq("id", tenantId).maybeSingle();
  await notifyOwnerInvited({
    tenantId,
    businessName: tenant?.business_name ?? "your business",
    email: email.data,
    inviteUrl: link,
  });
  return { status: "success", message: "inviteCreated", data: { link } };
}

/** Records that a storefront host has been attached in the hosting panel (Hostinger hPanel). */
export async function setDomainConnected(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await platformActionUser())) return FORBIDDEN;
  const input = z
    .object({ domain_id: z.uuid(), connected: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "error", error: "invalid" };
  const supabase = await createUserClient();
  const { error } = await supabase
    .from("tenant_domains")
    .update({ hosting_connected_at: input.data.connected === "true" ? new Date().toISOString() : null })
    .eq("id", input.data.domain_id);
  if (error) return { status: "error", error: "generic" };
  revalidatePath(DETAIL, "page");
  return { status: "success", message: "saved" };
}
