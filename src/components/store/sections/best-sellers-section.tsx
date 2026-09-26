import { getTranslations } from "next-intl/server";

import type { SectionProps } from "@/lib/storefront/sections";
import { getBestSellers } from "@/server/catalog/storefront";

import { ProductGridSection } from "./product-grid-section";
import { text, type SectionContext } from "./types";

/** Most-ordered products of the last 90 days; hidden until the store has sales. */
export async function BestSellersSection({ props, ctx }: { props: SectionProps<"best_sellers">; ctx: SectionContext }) {
  const t = await getTranslations("store.sections");
  const items = await getBestSellers(ctx, props.limit);
  if (items.length === 0) return null;
  return (
    <ProductGridSection
      id="best-sellers-title"
      title={text(ctx, props.title) || t("bestSellersTitle")}
      products={items}
      viewAllHref="/shop"
      ctx={ctx}
    />
  );
}
