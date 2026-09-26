import { useLocale } from "next-intl";

import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";

/** Formatted amount in the store currency (minor units in, localized text out). */
export function Money({ amount, currency, exponent }: { amount: bigint; currency: string; exponent: number }) {
  const locale = useLocale() as Locale;
  return <span className="tabular-nums">{formatMoney({ amountMinor: amount, currency }, exponent, locale)}</span>;
}
