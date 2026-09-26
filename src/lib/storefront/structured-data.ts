import { formatAddress } from "@/lib/address";
import { pickLocalized } from "@/lib/localized";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import type { Locale } from "@/i18n/locales";

import { parseOpeningHours, toSchemaOrgHours } from "./hours";

const SCHEMA_TYPE: Record<string, string> = {
  cafe: "CafeOrCoffeeShop",
  restaurant: "Restaurant",
  food: "FoodEstablishment",
  retail: "Store",
  beauty: "BeautySalon",
  salon: "HairSalon",
  spa: "DaySpa",
  gym: "ExerciseGym",
  other: "LocalBusiness",
};

/** schema.org LocalBusiness/Organization for the tenant (JSON-LD). */
export function businessJsonLd(tenant: ActiveStorefrontTenant, locale: Locale, origin: string, logoUrl: string | null) {
  const address = tenant.address as Record<string, string | undefined>;
  const hours = toSchemaOrgHours(parseOpeningHours(tenant.opening_hours));
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[tenant.business_type] ?? "LocalBusiness",
    "@id": `${origin}/#business`,
    name: tenant.business_name,
    url: `${origin}/${locale}`,
    description: pickLocalized(tenant.description, locale, tenant.default_language) || undefined,
    telephone: tenant.phone ?? undefined,
    email: tenant.email ?? undefined,
    logo: logoUrl ?? undefined,
    image: logoUrl ?? undefined,
    currenciesAccepted: tenant.currency,
    address: formatAddress(tenant.address)
      ? {
          "@type": "PostalAddress",
          streetAddress: [address.line1, address.line2].filter(Boolean).join(", ") || undefined,
          addressLocality: address.city ?? tenant.city ?? undefined,
          postalCode: address.postal_code,
          addressCountry: address.country ?? tenant.country ?? undefined,
        }
      : undefined,
    openingHoursSpecification: hours.length > 0 ? hours : undefined,
  };
}

/** Serializes JSON-LD safely for inline <script> (no `</script>` break-out). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
