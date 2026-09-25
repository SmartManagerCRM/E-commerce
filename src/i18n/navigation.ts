import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from "./locales";

/**
 * Locale-aware navigation helpers. Public URLs always carry the locale
 * prefix (`/ar/...`); the host-specific internal rewrite happens in the proxy,
 * so links are written as plain public paths (e.g. `<Link href="/shop">`).
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
