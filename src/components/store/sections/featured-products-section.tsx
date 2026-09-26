import { getTranslations } from "next-intl/server";

import type { SectionProps } from "@/lib/storefront/sections";
import { getCatalog } from "@/server/catalog/storefront";

import { ProductGridSection } from "./product-grid-section";
import { text, type SectionContext } from "./types";

/** Featured products first, then the rest of the catalog in the owner's order. */
export async function FeaturedProductsSection({
  props,
  ctx,
}: {
  props: SectionProps<"featured_products">;
  ctx: SectionContext;
}) {
  const t = await getTranslations("store.sections");
  const { items } = await getCatalog(ctx, { sort: "featured", limit: props.limit });
  if (items.length === 0) return null;
  return (
    <ProductGridSection
      id="featured-products-title"
      title={text(ctx, props.title) || t("featuredProductsTitle")}
      products={items}
      viewAllHref="/shop"
      ctx={ctx}
    />
  );
}
