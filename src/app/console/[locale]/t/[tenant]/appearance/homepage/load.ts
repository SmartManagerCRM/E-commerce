import "server-only";

import { randomUUID } from "node:crypto";

import { formatAddress } from "@/lib/address";
import { asLocalizedText } from "@/lib/localized";
import { defaultSections, parseSections, type Section } from "@/lib/storefront/sections";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Sections as the editor sees them: the stored list, or — until the tenant
 * saves once — the same defaults the storefront shows (with fresh ids that
 * become permanent on the first save).
 */
export async function loadEditableSections(context: TenantAdminContext): Promise<Section[]> {
  const supabase = await createUserClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase.from("storefront_configs").select("homepage_sections").eq("tenant_id", context.tenant.id).single(),
    supabase
      .from("tenants")
      .select("business_name, tagline, description, address")
      .eq("id", context.tenant.id)
      .single(),
  ]);
  const stored = config?.homepage_sections;
  if (Array.isArray(stored) && stored.length > 0) return parseSections(stored);
  return defaultSections(
    {
      business_name: tenant?.business_name ?? context.tenant.businessName,
      tagline: asLocalizedText(tenant?.tagline),
      description: asLocalizedText(tenant?.description),
      hasAddress: formatAddress((tenant?.address ?? {}) as Record<string, unknown>) !== "",
    },
    randomUUID,
  );
}
