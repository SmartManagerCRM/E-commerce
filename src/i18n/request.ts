import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, isLocale } from "./locales";

/**
 * next-intl request configuration. The locale comes from the `[locale]`
 * route segment (via `setRequestLocale`) or the header set by the proxy.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
