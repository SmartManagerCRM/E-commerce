import { z } from "zod";

import { LOCALES, type Locale } from "@/i18n/locales";

/**
 * Shape returned by the `public.resolve_storefront()` database function.
 * Validated at the boundary so the rest of the app can rely on it.
 */
const locale = z.enum(LOCALES);
const localized = z.record(z.string(), z.string()).catch({});

const storefrontConfigSchema = z.object({
  theme_key: z.string(),
  tokens: z.record(z.string(), z.unknown()).catch({}),
  header: z.record(z.string(), z.unknown()).catch({}),
  footer: z.record(z.string(), z.unknown()).catch({}),
  homepage_sections: z.array(z.unknown()).catch([]),
  seo: z.record(z.string(), z.unknown()).catch({}),
});

const baseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  business_name: z.string(),
  default_language: locale,
  enabled_languages: z.array(locale).min(1),
});

const activeSchema = baseSchema.extend({
  status: z.literal("active"),
  business_type: z.string(),
  description: localized,
  tagline: localized,
  logo_path: z.string().nullable(),
  favicon_path: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.record(z.string(), z.unknown()).catch({}),
  country: z.string().nullable(),
  city: z.string().nullable(),
  currency: z.string().length(3),
  currency_exponent: z.number().int().min(0).max(4),
  timezone: z.string(),
  primary_domain: z.string().nullable(),
  storefront: storefrontConfigSchema,
});

const unavailableSchema = baseSchema.extend({
  status: z.enum(["onboarding", "suspended"]),
});

export const storefrontTenantSchema = z.discriminatedUnion("status", [activeSchema, unavailableSchema]);

export type StorefrontTenant = z.infer<typeof storefrontTenantSchema>;
export type ActiveStorefrontTenant = z.infer<typeof activeSchema>;

export function isActiveTenant(tenant: StorefrontTenant): tenant is ActiveStorefrontTenant {
  return tenant.status === "active";
}

export function tenantLocales(tenant: Pick<StorefrontTenant, "enabled_languages">): Locale[] {
  // Keep the platform's canonical order for consistent switchers.
  return LOCALES.filter((l) => tenant.enabled_languages.includes(l));
}
