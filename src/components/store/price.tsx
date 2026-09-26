import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import type { PriceView } from "@/lib/storefront/catalog-types";

/** Price with optional compare-at (sale) price, announced clearly to screen readers. */
export function Price({
  price,
  size = "md",
  className,
}: {
  price: PriceView;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("catalog");
  const fmt = (minor: bigint) => formatMoney({ amountMinor: minor, currency: price.currency }, price.exponent, locale);
  const onSale = price.compareAtMinor !== null && price.compareAtMinor > price.amountMinor;
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" } as const;

  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", sizes[size], className)}>
      <span className={cn("font-semibold tabular-nums", onSale && "text-danger")}>
        {onSale ? <span className="sr-only">{t("salePrice")} </span> : null}
        {fmt(price.amountMinor)}
      </span>
      {onSale ? (
        <s className="text-[0.85em] text-muted tabular-nums">
          <span className="sr-only">{t("originalPrice")} </span>
          {fmt(price.compareAtMinor!)}
        </s>
      ) : null}
    </p>
  );
}
