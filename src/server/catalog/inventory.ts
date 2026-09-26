import "server-only";

import type { Locale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import type { TypedSupabaseClient } from "@/server/supabase/clients";

/** "Size / Grind" labels for variants, resolved from option value ids in one query. */
export async function optionLabels(
  supabase: TypedSupabaseClient,
  valueIds: string[],
  locale: Locale,
  fallback: Locale,
): Promise<Map<string, string>> {
  const unique = [...new Set(valueIds)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("product_option_values")
    .select("id, label, product_options(position)")
    .in("id", unique);
  return new Map(
    (data ?? [])
      .sort((a, b) => (a.product_options?.position ?? 0) - (b.product_options?.position ?? 0))
      .map((v) => [v.id, pickLocalized(v.label, locale, fallback)]),
  );
}

export function variantLabel(ids: string[], labels: Map<string, string>): string {
  return ids
    .map((id) => labels.get(id))
    .filter(Boolean)
    .join(" / ");
}
