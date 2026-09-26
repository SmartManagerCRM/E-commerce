import Image from "next/image";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { CardStyle } from "@/lib/storefront/design";
import type { ProductCardView } from "@/lib/storefront/catalog-types";

import { Price } from "./price";
import { Rating } from "./rating";

const FRAME: Record<CardStyle, string> = {
  minimal: "",
  bordered: "border border-border p-3",
  elevated: "bg-surface p-3 shadow-card",
};

/**
 * Product card used by every catalog grid. One component, three visual
 * styles chosen by the theme/tenant; the whole card is one link (single tab
 * stop) with the image hidden from screen readers to avoid duplicate names.
 */
export function ProductCard({
  product,
  style,
  priority,
}: {
  product: ProductCardView;
  style: CardStyle;
  priority?: boolean;
}) {
  const t = useTranslations("catalog");
  const soldOut = product.availability === "out_of_stock";
  return (
    <article className={cn("group relative flex flex-col rounded-lg", FRAME[style])}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-fg/[0.04]">
        {product.image ? (
          <Image
            src={product.image.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className={cn(
              "object-cover transition-[transform,opacity] duration-500 ease-standard group-hover:scale-[1.03]",
              soldOut && "opacity-60",
            )}
          />
        ) : null}
        {product.hoverImage ? (
          <Image
            src={product.hoverImage.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        ) : null}
        <div className="absolute start-3 top-3 flex flex-col items-start gap-1.5">
          {soldOut ? (
            <Badge tone="neutral" className="bg-surface/90">
              {t("soldOut")}
            </Badge>
          ) : null}
          {!soldOut && product.badges?.includes("sale") ? <Badge tone="primary">{t("badge.sale")}</Badge> : null}
          {!soldOut && product.badges?.includes("new") ? (
            <Badge tone="outline" className="bg-surface/90">
              {t("badge.new")}
            </Badge>
          ) : null}
          {!soldOut && product.badges?.includes("bestseller") ? (
            <Badge tone="outline" className="bg-surface/90">
              {t("badge.bestseller")}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-1">
        <h3 className="text-sm font-medium leading-snug sm:text-base">
          <Link
            href={product.href}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-lg after:focus-visible:ring-2 after:focus-visible:ring-primary"
          >
            {product.name}
          </Link>
        </h3>
        {product.subtitle ? <p className="text-xs text-muted sm:text-sm">{product.subtitle}</p> : null}
        {product.rating ? (
          <Rating value={product.rating.value} count={product.rating.count} className="text-xs" />
        ) : null}
        {product.availability === "low_stock" ? <p className="text-xs text-warning">{t("lowStock")}</p> : null}
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <Price price={product.price} size="sm" />
          {product.optionsLabel ? <span className="text-xs text-muted">{product.optionsLabel}</span> : null}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">{children}</div>;
}
