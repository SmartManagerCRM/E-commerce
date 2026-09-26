import { getTranslations } from "next-intl/server";

import type { SectionProps } from "@/lib/storefront/sections";
import { getCatalog, getCategories } from "@/server/catalog/storefront";

import { ProductGridSection } from "./product-grid-section";
import { text, type SectionContext } from "./types";

/** Products of one category (hidden when the category is empty or gone). */
export async function ProductCollectionSection({
  props,
  ctx,
  sectionId,
}: {
  props: SectionProps<"product_collection">;
  ctx: SectionContext;
  sectionId: string;
}) {
  if (!props.category) return null;
  const t = await getTranslations("store.shop");
  const category = (await getCategories(ctx.tenant, ctx.locale)).find((c) => c.slug === props.category);
  if (!category) return null;
  const { items } = await getCatalog(ctx, { category: category.slug, sort: "featured", limit: props.limit });
  if (items.length === 0) return null;
  return (
    <ProductGridSection
      id={`collection-${sectionId}`}
      title={text(ctx, props.title) || category.name || t("title")}
      products={items}
      viewAllHref={`/shop/${category.slug}`}
      ctx={ctx}
    />
  );
}
