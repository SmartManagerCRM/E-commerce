import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShopView } from "@/components/store/catalog/shop-view";
import { parseCatalogFilters, PAGE_SIZE } from "@/lib/catalog/filters";
import { getCatalog, getCategories } from "@/server/catalog/storefront";
import { requireStorePage, storeAlternates } from "@/server/storefront/page-tenant";
import { storefrontDesign } from "@/server/storefront/homepage";

type Props = PageProps<"/store/[tenant]/[locale]/shop/[category]">;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale, category: categorySlug } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const category = (await getCategories(tenant, locale)).find((c) => c.slug === categorySlug);
  if (!category) return {};
  const filtered = Object.keys(await searchParams).length > 0;
  return {
    title: category.name,
    description: category.description || undefined,
    alternates: storeAlternates(tenant, locale, `/shop/${category.slug}`),
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { tenant: slug, locale: rawLocale, category: categorySlug } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const categories = await getCategories(tenant, locale);
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) notFound();
  const filters = parseCatalogFilters(await searchParams, tenant.currency_exponent);
  const result = await getCatalog({ tenant, locale }, { ...filters, category: category.slug, limit: PAGE_SIZE });
  return (
    <ShopView
      locale={locale}
      exponent={tenant.currency_exponent}
      currency={tenant.currency}
      cardStyle={storefrontDesign(tenant).card}
      filters={filters}
      categories={categories}
      category={category}
      result={result}
    />
  );
}
