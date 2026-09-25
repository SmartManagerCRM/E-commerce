import "server-only";

import { cache } from "react";

import { isLocale, type Locale } from "@/i18n/locales";
import type { StorefrontTenant } from "@/lib/tenant";

import { resolveStorefrontTenant } from "./resolver";

/**
 * Storefront tenant for the current render. The slug in the internal route
 * (`/store/<slug>/…`) is always written by the proxy from the resolved
 * hostname; visitors cannot reach `/store/*` paths directly.
 */
export const getStorefrontTenant = cache(async (slug: string): Promise<StorefrontTenant | null> => {
  return resolveStorefrontTenant({ by: "slug", slug });
});

export function isTenantLocale(tenant: StorefrontTenant, locale: string): locale is Locale {
  return isLocale(locale) && tenant.enabled_languages.includes(locale);
}
