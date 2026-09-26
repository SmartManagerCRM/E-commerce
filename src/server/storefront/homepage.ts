import "server-only";

import { randomUUID } from "node:crypto";

import { cache } from "react";

import { formatAddress } from "@/lib/address";
import { asLocalizedText } from "@/lib/localized";
import { resolveStorefrontDesign, type StorefrontDesign } from "@/lib/storefront/design";
import { defaultSections, parseSections, type Section } from "@/lib/storefront/sections";
import type { ActiveStorefrontTenant } from "@/lib/tenant";

/** The tenant's configured homepage, or defaults built from its real profile. */
export function homepageSections(tenant: ActiveStorefrontTenant): Section[] {
  const stored = tenant.storefront.homepage_sections;
  if (Array.isArray(stored) && stored.length > 0) return parseSections(stored);
  return defaultSections(
    {
      business_name: tenant.business_name,
      tagline: asLocalizedText(tenant.tagline),
      description: asLocalizedText(tenant.description),
      hasAddress: formatAddress(tenant.address) !== "",
    },
    // Stable ids per render are enough for defaults (never persisted as-is).
    randomUUID,
  );
}

export const storefrontDesign = cache((tenant: ActiveStorefrontTenant): StorefrontDesign =>
  resolveStorefrontDesign(tenant.storefront),
);
