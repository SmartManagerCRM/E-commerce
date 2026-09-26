import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ShopView } from "@/components/store/catalog/shop-view";
import { parseCatalogFilters, PAGE_SIZE } from "@/lib/catalog/filters";
import { getCatalog, getCategories } from "@/server/catalog/storefront";
import { requireStorePage, storeAlternates } from "@/server/storefront/page-tenant";
import { storefrontDesign } from "@/server/storefront/homepage";

type Props = PageProps<"/store/[tenant]/[locale]/shop">;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "store.shop" });
  const filtered = Object.keys(await searchParams).length > 0;
  return {
    title: t("title"),
    alternates: storeAlternates(tenant, locale, "/shop"),
    // Filtered/sorted/paginated variants are not separate pages for search engines.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { tenant: slug, locale: rawLocale } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const filters = parseCatalogFilters(await searchParams, tenant.currency_exponent);
  const ctx = { tenant, locale };
  const [categories, result] = await Promise.all([
    getCategories(tenant, locale),
    getCatalog(ctx, { ...filters, limit: PAGE_SIZE }),
  ]);
  return (
    <ShopView
      locale={locale}
      exponent={tenant.currency_exponent}
      currency={tenant.currency}
      cardStyle={storefrontDesign(tenant).card}
      filters={filters}
      categories={categories}
      category={null}
      result={result}
    />
  );
}
