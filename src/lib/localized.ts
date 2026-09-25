import { LOCALES, type Locale } from "@/i18n/locales";

/** Multilingual content as stored in the database: `{ en?, fr?, ar? }`. */
export type LocalizedText = Partial<Record<Locale, string>>;

export function asLocalizedText(value: unknown): LocalizedText {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: LocalizedText = {};
  for (const locale of LOCALES) {
    const text = (value as Record<string, unknown>)[locale];
    if (typeof text === "string" && text.trim() !== "") result[locale] = text;
  }
  return result;
}

/**
 * Resolves localized content with a predictable fallback chain:
 * requested locale → tenant default locale → any available translation.
 */
export function pickLocalized(value: unknown, locale: Locale, fallbackLocale?: Locale): string {
  const text = asLocalizedText(value);
  return (
    text[locale] ??
    (fallbackLocale ? text[fallbackLocale] : undefined) ??
    LOCALES.map((l) => text[l]).find((t): t is string => Boolean(t)) ??
    ""
  );
}
