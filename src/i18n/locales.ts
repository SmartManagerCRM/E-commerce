/**
 * Supported interface languages. Adding a locale means adding it here, adding
 * a `messages/<locale>.json` file and extending `app.supported_locales()` in
 * the database.
 */
export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar"]);

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Native names, shown in language switchers regardless of the active locale. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

/** BCP 47 tags used for Intl formatting (numbers, dates, currencies). */
export const LOCALE_FORMAT_TAGS: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
  // Latin digits are the norm for prices in Gulf e-commerce; switch to
  // "ar-SA" (Arabic-Indic digits) per tenant later if requested.
  ar: "ar-SA-u-nu-latn",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeDirection(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * Splits `/fr/shop/beans` into `{ locale: "fr", rest: "/shop/beans" }`.
 * Returns `locale: null` when the first segment is not a supported locale.
 */
export function splitLocaleFromPath(pathname: string): { locale: Locale | null; rest: string } {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match && isLocale(match[1])) {
    return { locale: match[1], rest: match[2] ?? "" };
  }
  return { locale: null, rest: pathname === "/" ? "" : pathname };
}

/** Parses an Accept-Language header into language codes ordered by quality. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
      return { lang: tag.toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.lang && entry.lang !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.lang);
}

/**
 * Picks the locale for a visitor without a locale in the URL:
 * cookie → Accept-Language → fallback. Only `allowed` locales are returned.
 */
export function negotiateLocale(options: {
  allowed: readonly Locale[];
  fallback: Locale;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const { allowed, fallback, cookie, acceptLanguage } = options;
  if (isLocale(cookie) && allowed.includes(cookie)) return cookie;
  for (const lang of parseAcceptLanguage(acceptLanguage)) {
    if (isLocale(lang) && allowed.includes(lang)) return lang;
  }
  return allowed.includes(fallback) ? fallback : (allowed[0] ?? DEFAULT_LOCALE);
}
