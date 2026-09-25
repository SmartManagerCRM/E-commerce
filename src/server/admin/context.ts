import "server-only";

import { cache } from "react";
import { z } from "zod";

import { notFound } from "next/navigation";

import type { Locale } from "@/i18n/locales";
import type { AdminAccess } from "@/lib/admin/modules";
import { getSessionUser, requireUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/clients";

const adminContextSchema = z.object({
  tenant_id: z.uuid(),
  role_key: z.string().nullable(),
  is_platform_admin: z.boolean(),
  permissions: z.array(z.string()),
  features: z.record(z.string(), z.object({ enabled: z.boolean(), limit: z.number().int().nullable() })),
});

export type TenantAdminContext = AdminAccess & {
  tenant: { id: string; slug: string; businessName: string; status: string };
  roleKey: string | null;
  isPlatformAdmin: boolean;
};

/**
 * Loads the admin context for a tenant slug using the signed-in user's
 * session. Membership and permissions are decided by the database
 * (`tenant_admin_context` raises for non-members), so a user can never
 * load another tenant's console by changing the URL.
 */
export const getTenantAdminContext = cache(async (slug: string): Promise<TenantAdminContext | null> => {
  if (!(await getSessionUser())) return null;
  const supabase = await createUserClient();

  // RLS only returns tenants the user belongs to (or all, for platform admins).
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, slug, business_name, status")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw new Error(`Failed to load tenant: ${tenantError.message}`);
  if (!tenant) return null;

  const { data, error } = await supabase.rpc("tenant_admin_context", { p_tenant: tenant.id });
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Failed to load admin context: ${error.message}`);
  }

  const context = adminContextSchema.parse(data);
  return {
    tenant: { id: tenant.id, slug: tenant.slug, businessName: tenant.business_name, status: tenant.status },
    roleKey: context.role_key,
    isPlatformAdmin: context.is_platform_admin,
    permissions: context.permissions,
    features: context.features,
  };
});

/**
 * Guard for every tenant console layout and page. Layouts and pages render in
 * parallel in the App Router, so each one must enforce access itself:
 * signed out → login; not a member (or unknown tenant) → 404.
 */
export async function requireTenantAdmin(locale: Locale, slug: string): Promise<TenantAdminContext> {
  await requireUser(locale);
  const context = await getTenantAdminContext(slug);
  if (!context) notFound();
  return context;
}
