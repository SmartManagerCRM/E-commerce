import type { Metadata } from "next";
import { ImageIcon, PackagePlus, Search } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { likePattern, normalizeSearch } from "@/lib/catalog/search";
import { pickLocalized } from "@/lib/localized";
import { formatMoney } from "@/lib/money";
import { publicMediaUrl } from "@/lib/storage";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/products">;

const STATUSES = ["all", "active", "draft", "archived"] as const;
const PAGE_SIZE = 50;
const STATUS_TONE: Record<string, BadgeTone> = { active: "success", draft: "neutral", archived: "outline" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("products") };
}

export default async function ProductsPage({ params, searchParams }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const query = await searchParams;
  return (
    <ModuleGate context={context} moduleKey="products">
      <ProductList
        slug={slug}
        locale={locale}
        context={context}
        q={typeof query.q === "string" ? query.q.slice(0, 100) : ""}
        status={STATUSES.find((s) => s === query.status) ?? "all"}
        page={Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1)}
      />
    </ModuleGate>
  );
}

async function ProductList({
  slug,
  locale,
  context,
  q,
  status,
  page,
}: {
  slug: string;
  locale: Locale;
  context: TenantAdminContext;
  q: string;
  status: (typeof STATUSES)[number];
  page: number;
}) {
  const t = await getTranslations("products");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  const canWrite = context.permissions.includes("catalog.write");
  const showStock = context.features.inventory?.enabled === true && context.permissions.includes("inventory.read");

  let request = supabase
    .from("products")
    .select(
      "id, name, slug, status, featured, price_min_minor, price_max_minor, updated_at, product_images(storage_path, position), product_variants(id, status, inventory_items(on_hand, reserved, track_stock))",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status !== "all") request = request.eq("status", status);
  const needle = normalizeSearch(q);
  if (needle) request = request.ilike("search_text", likePattern(needle));
  const { data: products, count, error } = await request;
  if (error) throw new Error(`Failed to load products: ${error.message}`);

  const limit = context.features.max_products?.limit ?? null;
  const { count: used } = limit
    ? await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenant.id)
        .neq("status", "archived")
    : { count: null };

  const money = (minor: number | null) =>
    minor === null
      ? "—"
      : formatMoney({ amountMinor: BigInt(minor), currency: settings.currency }, settings.exponent, locale);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const next = { q, status, page, ...patch };
    if (next.q) p.set("q", String(next.q));
    if (next.status !== "all") p.set("status", String(next.status));
    if (Number(next.page) > 1) p.set("page", String(next.page));
    const s = p.toString();
    return `/t/${slug}/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {limit !== null ? t("usage", { used: used ?? 0, limit }) : t("listSubtitle")}
          </p>
        </div>
        {canWrite ? (
          <Link href={`/t/${slug}/products/new`} className={buttonClasses("primary")}>
            <PackagePlus className="size-4" aria-hidden="true" />
            {t("new")}
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("statusFilter")} className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={qs({ status: s, page: 1 })}
              aria-current={s === status ? "page" : undefined}
              className={
                s === status
                  ? "rounded-md bg-fg px-3 py-1.5 text-sm text-bg"
                  : "rounded-md px-3 py-1.5 text-sm text-muted hover:bg-fg/5 hover:text-fg"
              }
            >
              {t(`status.${s}`)}
            </Link>
          ))}
        </nav>
        <form method="get" role="search" className="relative sm:w-72">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="product-search" className="sr-only">
            {t("search")}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="product-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface ps-9 pe-3 text-base sm:text-sm"
          />
        </form>
      </div>

      {products && products.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("product")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("statusLabel")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("price")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("variants")}
                </th>
                {showStock ? (
                  <th scope="col" className="px-4 py-3 text-end font-medium">
                    {t("stock")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p) => {
                const name = pickLocalized(p.name, locale, settings.defaultLocale);
                const cover = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
                const src = publicMediaUrl(cover?.storage_path);
                const variants = (p.product_variants ?? []).filter((v) => v.status === "active");
                const tracked = variants.flatMap((v) => v.inventory_items ?? []).filter((i) => i.track_stock);
                const stock = tracked.reduce((n, i) => n + i.on_hand - i.reserved, 0);
                const range =
                  p.price_min_minor !== null && p.price_max_minor !== null && p.price_max_minor > p.price_min_minor
                    ? `${money(p.price_min_minor)} – ${money(p.price_max_minor)}`
                    : money(p.price_min_minor);
                return (
                  <tr key={p.id} className="hover:bg-bg/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/t/${slug}/products/${p.id}`}
                        className="flex items-center gap-3 font-medium hover:underline"
                      >
                        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg">
                          {src ? (
                            <Image src={src} alt="" fill sizes="44px" className="object-cover" />
                          ) : (
                            <ImageIcon className="size-4 text-muted" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{name || t("untitled")}</span>
                          <span className="block truncate text-xs font-normal text-muted" dir="ltr">
                            /{p.slug}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{t(`status.${p.status as "active"}`)}</Badge>
                        {p.featured ? <Badge tone="outline">{t("featured")}</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">{range}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{variants.length}</td>
                    {showStock ? (
                      <td className="px-4 py-3 text-end tabular-nums">
                        {tracked.length === 0 ? (
                          <span className="text-muted">{t("notTracked")}</span>
                        ) : stock <= 0 ? (
                          <span className="text-danger">{t("outOfStock")}</span>
                        ) : (
                          stock
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : q || status !== "all" ? (
        <EmptyState icon={<Search />} title={t("noResults")} description={t("noResultsBody")} />
      ) : (
        <EmptyState
          icon={<PackagePlus />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            canWrite ? (
              <Link href={`/t/${slug}/products/new`} className={buttonClasses("primary", "sm")}>
                {t("new")}
              </Link>
            ) : undefined
          }
        />
      )}

      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={qs({ page: page - 1 })} className={buttonClasses("secondary", "sm")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">{t("pageOf", { page, total: pages })}</span>
          {page < pages ? (
            <Link href={qs({ page: page + 1 })} className={buttonClasses("secondary", "sm")}>
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
