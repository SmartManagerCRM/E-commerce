import { PackageOpen, SearchX, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { catalogQuery, hasActiveFilters, PAGE_SIZE, SORTS, type CatalogFilters } from "@/lib/catalog/filters";
import { cn } from "@/lib/cn";
import { minorToDecimal } from "@/lib/money";
import type { CategoryView, ProductCardView } from "@/lib/storefront/catalog-types";
import type { CardStyle } from "@/lib/storefront/design";

import { ProductCard, ProductGrid } from "../product-card";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { SortSelect } from "./sort-select";

type ShopViewProps = {
  locale: Locale;
  exponent: number;
  currency: string;
  cardStyle: CardStyle;
  filters: CatalogFilters;
  categories: CategoryView[];
  category: CategoryView | null;
  result: { total: number; items: ProductCardView[] };
};

/**
 * Product listing shared by /shop and /shop/<category>. Filters are a plain
 * GET form (works without JavaScript, shareable URLs); pagination uses links.
 */
export async function ShopView({
  locale,
  exponent,
  currency,
  cardStyle,
  filters,
  categories,
  category,
  result,
}: ShopViewProps) {
  const t = await getTranslations("store.shop");
  const tNav = await getTranslations("store.nav");
  const basePath = category ? `/shop/${category.slug}` : "/shop";
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const filtered = hasActiveFilters(filters);
  const href = (patch: Partial<CatalogFilters>) => `${basePath}${catalogQuery({ ...filters, ...patch }, exponent)}`;

  const crumbs: Crumb[] = [{ label: tNav("home"), href: "/" }];
  if (category) {
    const parent = categories.find((c) => c.id === category.parentId);
    crumbs.push({ label: t("title"), href: "/shop" });
    if (parent) crumbs.push({ label: parent.name, href: `/shop/${parent.slug}` });
    crumbs.push({ label: category.name });
  } else {
    crumbs.push({ label: t("title") });
  }

  const visibleCategories = categories.filter((c) => c.productCount > 0 || categories.some((x) => x.parentId === c.id));
  const topLevel = visibleCategories.filter((c) => c.parentId === null);
  const children = category ? visibleCategories.filter((c) => c.parentId === (category.parentId ?? category.id)) : [];
  const decimal = (minor: bigint | null) => (minor === null ? "" : minorToDecimal(minor, exponent));
  const step = exponent > 0 ? `0.${"0".repeat(exponent - 1)}1` : "1";

  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={crumbs} label={t("breadcrumb")} />
      <header className="mt-6 max-w-2xl">
        <h1 className="font-display text-display-md font-semibold text-balance rtl:leading-snug">
          {category?.name ?? t("title")}
        </h1>
        {category?.description ? <p className="mt-3 text-muted text-pretty">{category.description}</p> : null}
      </header>

      {topLevel.length > 0 ? (
        <nav aria-label={t("categories")} className="mt-6 -mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <ul className="flex w-max gap-2">
            {[{ id: "all", slug: "", name: t("allProducts") }, ...topLevel].map((c) => {
              const active = c.slug === "" ? !category : category?.id === c.id || category?.parentId === c.id;
              return (
                <li key={c.id}>
                  <Link
                    href={c.slug ? `/shop/${c.slug}` : "/shop"}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center rounded-button border px-4 text-sm transition-colors",
                      active ? "border-fg bg-fg text-bg" : "border-border bg-surface hover:border-fg/50",
                    )}
                  >
                    {c.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {children.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/shop/${c.slug}`}
                aria-current={category?.id === c.id ? "page" : undefined}
                className={cn("text-muted hover:text-fg", category?.id === c.id && "font-medium text-fg underline")}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <details
          className="group rounded-lg border border-border bg-surface lg:border-0 lg:bg-transparent"
          open={filtered}
        >
          <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium lg:hidden [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t("filters")}
          </summary>
          <form
            method="get"
            action={`/${locale}${basePath}`}
            role="search"
            aria-label={t("filters")}
            className="space-y-5 border-t border-border p-4 lg:sticky lg:top-24 lg:border-0 lg:p-0"
          >
            <div className="space-y-1.5">
              <label htmlFor="shop-q" className="block text-sm font-medium">
                {t("searchLabel")}
              </label>
              <input
                id="shop-q"
                type="search"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder={t("searchPlaceholder")}
                maxLength={100}
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-base sm:text-sm"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("price", { currency })}</legend>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="shop-min">
                  {t("min")}
                </label>
                <input
                  id="shop-min"
                  name="min"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={step}
                  placeholder={t("min")}
                  defaultValue={decimal(filters.minMinor)}
                  className="h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-base tabular-nums sm:text-sm"
                />
                <span aria-hidden="true" className="text-muted">
                  –
                </span>
                <label className="sr-only" htmlFor="shop-max">
                  {t("max")}
                </label>
                <input
                  id="shop-max"
                  name="max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={step}
                  placeholder={t("max")}
                  defaultValue={decimal(filters.maxMinor)}
                  className="h-11 w-full min-w-0 rounded-md border border-border bg-bg px-3 text-base tabular-nums sm:text-sm"
                />
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="available"
                value="1"
                defaultChecked={filters.available}
                className="size-4 accent-primary"
              />
              {t("availableOnly")}
            </label>
            <input type="hidden" name="sort" value={filters.sort} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClasses("primary", "sm")}>
                {t("apply")}
              </button>
              {filtered ? (
                <Link
                  href={href({ q: null, minMinor: null, maxMinor: null, available: false, page: 1 })}
                  className={buttonClasses("ghost", "sm")}
                >
                  {t("clear")}
                </Link>
              ) : null}
            </div>
          </form>
        </details>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" role="status">
              {t("results", { count: result.total })}
            </p>
            <SortSelect
              label={t("sort")}
              value={filters.sort}
              options={SORTS.map((s) => ({ value: s, label: t(`sortOptions.${s}`), href: href({ sort: s, page: 1 }) }))}
            />
          </div>

          {result.items.length > 0 ? (
            <ProductGrid>
              {result.items.map((product, index) => (
                <ProductCard key={product.id} product={product} style={cardStyle} priority={index < 4} />
              ))}
            </ProductGrid>
          ) : filtered || category ? (
            <EmptyState
              icon={<SearchX />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              action={
                <Link href="/shop" className={buttonClasses("secondary", "sm")}>
                  {t("allProducts")}
                </Link>
              }
            />
          ) : (
            <EmptyState icon={<PackageOpen />} title={t("emptyStoreTitle")} description={t("emptyStoreBody")} />
          )}

          {pages > 1 ? (
            <nav aria-label={t("pagination")} className="mt-12 flex items-center justify-between gap-4">
              {filters.page > 1 ? (
                <Link href={href({ page: filters.page - 1 })} rel="prev" className={buttonClasses("secondary", "sm")}>
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted">{t("pageOf", { page: Math.min(filters.page, pages), total: pages })}</p>
              {filters.page < pages ? (
                <Link href={href({ page: filters.page + 1 })} rel="next" className={buttonClasses("secondary", "sm")}>
                  {t("next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
