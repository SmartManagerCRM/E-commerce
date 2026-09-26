import "server-only";

import { cache } from "react";

import type { Locale } from "@/i18n/locales";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

export type CatalogSettings = {
  currency: string;
  exponent: number;
  locales: Locale[];
  defaultLocale: Locale;
};

/** Currency and languages used by the catalog editors (read with the member's session). */
export const catalogSettings = cache(async (context: TenantAdminContext): Promise<CatalogSettings> => {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("currency, enabled_languages, default_language, currencies(exponent)")
    .eq("id", context.tenant.id)
    .single();
  if (error || !data) throw new Error("Failed to load tenant settings");
  return {
    currency: data.currency,
    exponent: data.currencies?.exponent ?? 2,
    locales: data.enabled_languages as Locale[],
    defaultLocale: data.default_language as Locale,
  };
});

/** Maps database error codes from catalog writes to form error keys. */
export function catalogError(code: string | undefined, fallback = "generic"): string {
  switch (code) {
    case "42501":
      return "forbidden";
    case "23505":
      return "duplicate";
    case "53400":
      return "productLimit";
    case "22023":
    case "23514":
    case "22P02":
      return "invalid";
    case "P0002":
      return "notFound";
    default:
      return fallback;
  }
}
