"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_COOKIE, LOCALE_NATIVE_NAMES, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/cn";

type LanguageSwitcherProps = {
  locales: readonly Locale[];
  className?: string;
};

/**
 * Switches language on the same page, keeping the path and query string.
 * Client-side navigation preserves client state; the choice is remembered in
 * a cookie for visits without a locale in the URL.
 */
export function LanguageSwitcher({ locales, className }: LanguageSwitcherProps) {
  const t = useTranslations("common");
  const active = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (locales.length < 2) return null;

  const query = Object.fromEntries(searchParams.entries());

  return (
    <nav aria-label={t("changeLanguage")} className={cn("flex items-center gap-1", className)}>
      {locales.map((locale) => {
        const isActive = locale === active;
        return (
          <Link
            key={locale}
            href={{ pathname, query }}
            locale={locale}
            lang={locale}
            hrefLang={locale}
            aria-current={isActive ? "true" : undefined}
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
            }}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-sm px-2 text-sm transition-colors",
              isActive ? "font-semibold text-fg" : "text-muted hover:text-fg",
            )}
          >
            <span aria-hidden="true">{locale === "ar" ? "ع" : locale.toUpperCase()}</span>
            <span className="sr-only">{LOCALE_NATIVE_NAMES[locale]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
