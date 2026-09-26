import "server-only";

import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/locales";
import { isActiveTenant, tenantLocales, type ActiveStorefrontTenant } from "@/lib/tenant";
import { getStorefrontTenant, isTenantLocale } from "@/server/tenant/storefront";
import { storefrontOrigin } from "@/server/tenant/urls";

/** Active tenant + locale for a storefront page, or the storefront 404. */
export async function requireStorePage(
  slug: string,
  locale: string,
): Promise<{ tenant: ActiveStorefrontTenant; locale: Locale }> {
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isActiveTenant(tenant) || !isTenantLocale(tenant, locale)) notFound();
  setRequestLocale(locale);
  return { tenant, locale };
}

/** Canonical URL and hreflang alternates for a public path such as "/shop". */
export function storeAlternates(tenant: ActiveStorefrontTenant, locale: Locale, path: string) {
  const origin = storefrontOrigin(tenant);
  return {
    canonical: `${origin}/${locale}${path}`,
    languages: Object.fromEntries(tenantLocales(tenant).map((l) => [l, `${origin}/${l}${path}`])),
  };
}
