"use server";

import { revalidatePath } from "next/cache";

import { formDataToObject } from "@/lib/form-data";
import { fieldErrorsFrom, type FormState } from "@/lib/validation/common";
import { businessProfileSchema, customDomainSchema } from "@/lib/validation/tenant";
import { actionContext, storefrontChanged } from "@/server/admin/guards";
import { checkDomainOwnership } from "@/server/domains/verification";
import { serverEnv } from "@/server/env";
import { createUserClient, serviceClient } from "@/server/supabase/clients";

const SETTINGS_PATH = "/console/[locale]/t/[tenant]/settings";

export async function updateBusinessProfile(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };

  const parsed = businessProfileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
  const v = parsed.data;

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      business_name: v.business_name,
      tagline: v.tagline,
      description: v.description,
      phone: v.phone,
      email: v.email,
      address: Object.fromEntries(
        Object.entries({
          line1: v.address_line1,
          line2: v.address_line2,
          city: v.city,
          postal_code: v.postal_code,
          country: v.country,
        }).filter(([, value]) => value),
      ),
      city: v.city,
      country: v.country,
      timezone: v.timezone,
      default_language: v.default_language,
      enabled_languages: v.enabled_languages,
    })
    .eq("id", context.tenant.id);

  if (error) return { status: "error", error: "generic" };
  storefrontChanged();
  revalidatePath("/console/[locale]/t/[tenant]", "layout");
  return { status: "success", message: "saved" };
}

function isPlatformHost(hostname: string): boolean {
  const root = serverEnv().PLATFORM_ROOT_DOMAIN;
  return hostname === root || hostname.endsWith(`.${root}`);
}

export async function addCustomDomain(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!context.features.custom_domain?.enabled) return { status: "error", error: "notEntitled" };

  const parsed = customDomainSchema.safeParse(formData.get("hostname"));
  if (!parsed.success) return { status: "error", error: "invalidDomain" };
  if (isPlatformHost(parsed.data)) return { status: "error", error: "reservedDomain" };

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("tenant_domains")
    .insert({ tenant_id: context.tenant.id, hostname: parsed.data });
  if (error) return { status: "error", error: error.code === "23505" ? "domainTaken" : "generic" };

  revalidatePath(SETTINGS_PATH, "page");
  return { status: "success", message: "domainAdded" };
}

export async function verifyCustomDomain(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };

  // Read through RLS: the domain must belong to this tenant.
  const supabase = await createUserClient();
  const { data: domain } = await supabase
    .from("tenant_domains")
    .select("id, hostname, verification_token, verified_at")
    .eq("id", String(formData.get("domain_id")))
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (!domain) return { status: "error", error: "notFound" };
  if (domain.verified_at) return { status: "success", message: "domainVerified" };

  if (!serverEnv().SUPABASE_SECRET_KEY) return { status: "error", error: "serverNotConfigured" };

  const result = await checkDomainOwnership(domain.hostname, domain.verification_token);
  const { data: session } = await supabase.auth.getClaims();
  const { error } = await serviceClient().rpc("record_domain_check", {
    p_domain: domain.id,
    p_actor: session?.claims?.sub ?? "",
    p_verified: result.verified,
    p_error: result.verified ? undefined : result.reason,
  });
  if (error) return { status: "error", error: "generic" };

  revalidatePath(SETTINGS_PATH, "page");
  if (!result.verified) return { status: "error", error: `dns_${result.reason}` };
  storefrontChanged();
  return { status: "success", message: "domainVerified" };
}

export async function setPrimaryDomain(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("set_primary_domain", { p_domain: String(formData.get("domain_id")) });
  if (error) return { status: "error", error: error.code === "22023" ? "verifyFirst" : "generic" };
  storefrontChanged();
  revalidatePath(SETTINGS_PATH, "page");
  return { status: "success", message: "saved" };
}

export async function removeCustomDomain(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const supabase = await createUserClient();
  const { error } = await supabase
    .from("tenant_domains")
    .delete()
    .eq("id", String(formData.get("domain_id")))
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: "generic" };
  storefrontChanged();
  revalidatePath(SETTINGS_PATH, "page");
  return { status: "success", message: "domainRemoved" };
}
