import type { Locale } from "@/i18n/locales";
import { pickLocalized, type LocalizedText } from "@/lib/localized";
import type { StorefrontDesign } from "@/lib/storefront/design";
import type { ActiveStorefrontTenant } from "@/lib/tenant";

export type SectionContext = {
  locale: Locale;
  tenant: ActiveStorefrontTenant;
  design: StorefrontDesign;
  /** First section of a type gets a stable anchor for header navigation. */
  anchor?: string;
};

export function text(ctx: SectionContext, value: LocalizedText | undefined): string {
  return pickLocalized(value ?? {}, ctx.locale, ctx.tenant.default_language);
}
