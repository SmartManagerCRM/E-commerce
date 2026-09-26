import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { stockStatus, STOCK_TONE as STATUS_TONE, type StockStatus } from "@/lib/catalog/stock";
import { optionLabels, variantLabel } from "@/server/catalog/inventory";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/inventory">;

const PAGE_SIZE = 50;
const FILTERS = ["all", "low"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("inventory") };
}

export default async function InventoryPage({ params, searchParams }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const query = await searchParams;
  return (
    <ModuleGate context={context} moduleKey="inventory">
      <Inventory
        slug={slug}
        locale={locale}
        context={context}
        filter={FILTERS.find((f) => f === query.filter) ?? "all"}
        page={Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1)}
      />
    </ModuleGate>
  );
}

type Row = {
  id: string;
  productId: string;
  productName: string;
  variant: string;
  sku: string | null;
  onHand: number;
  reserved: number;
  minStock: number;
  status: StockStatus;
};

async function Inventory({
  slug,
  locale,
  context,
  filter,
  page,
}: {
  slug: string;
  locale: Locale;
  context: TenantAdminContext;
  filter: (typeof FILTERS)[number];
  page: number;
}) {
  const t = await getTranslations("inventory");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  let rows: Row[] = [];
  let total = 0;

  if (filter === "low") {
    const { data, error } = await supabase.rpc("low_stock_items", { p_tenant: context.tenant.id, p_limit: 200 });
    if (error) throw new Error(`Failed to load low stock: ${error.message}`);
    total = data.length;
    rows = data.map((r) => ({
      id: r.inventory_item_id,
      productId: r.product_id,
      productName: pickLocalized(r.product_name, locale, settings.defaultLocale),
      variant: ((r.option_labels as unknown[]) ?? [])
        .map((l) => pickLocalized(l, locale, settings.defaultLocale))
        .join(" / "),
      sku: r.sku,
      onHand: r.available,
      reserved: 0,
      minStock: r.min_stock,
      status: r.available <= 0 ? "out" : "low",
    }));
  } else {
    const { data, count, error } = await supabase
      .from("inventory_items")
      .select(
        "id, on_hand, reserved, min_stock, track_stock, product_variants!inner(sku, status, option_value_ids, position, products!inner(id, name, status))",
        { count: "exact" },
      )
      .eq("tenant_id", context.tenant.id)
      .eq("product_variants.status", "active")
      .neq("product_variants.products.status", "archived")
      .order("updated_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load inventory: ${error.message}`);
    total = count ?? 0;
    const labels = await optionLabels(
      supabase,
      (data ?? []).flatMap((i) => i.product_variants.option_value_ids),
      locale,
      settings.defaultLocale,
    );
    rows = (data ?? []).map((i) => ({
      id: i.id,
      productId: i.product_variants.products.id,
      productName: pickLocalized(i.product_variants.products.name, locale, settings.defaultLocale),
      variant: variantLabel(i.product_variants.option_value_ids, labels),
      sku: i.product_variants.sku,
      onHand: i.on_hand,
      reserved: i.reserved,
      minStock: i.min_stock,
      status: stockStatus(i),
    }));
  }

  const pages = filter === "low" ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (patch: { filter?: string; page?: number }) => {
    const next = { filter, page, ...patch };
    const p = new URLSearchParams();
    if (next.filter !== "all") p.set("filter", next.filter);
    if (next.page > 1) p.set("page", String(next.page));
    const s = p.toString();
    return `/t/${slug}/inventory${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <nav aria-label={t("filterLabel")} className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: 1 })}
            aria-current={f === filter ? "page" : undefined}
            className={
              f === filter
                ? "rounded-md bg-fg px-3 py-1.5 text-sm text-bg"
                : "rounded-md px-3 py-1.5 text-sm text-muted hover:bg-fg/5 hover:text-fg"
            }
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("product")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("sku")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("available")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("minStock")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("statusLabel")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-bg/60">
                  <td className="px-4 py-3">
                    <Link href={`/t/${slug}/inventory/${row.id}`} className="font-medium hover:underline">
                      {row.productName}
                    </Link>
                    {row.variant ? <p className="text-xs text-muted">{row.variant}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-muted" dir="ltr">
                    {row.sku ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-end tabular-nums">
                    {row.status === "untracked" ? "—" : row.onHand - row.reserved}
                  </td>
                  <td className="px-3 py-3 text-end tabular-nums">{row.status === "untracked" ? "—" : row.minStock}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Boxes />}
          title={filter === "low" ? t("noLowStock") : t("emptyTitle")}
          description={filter === "low" ? t("noLowStockBody") : t("emptyBody")}
          action={
            filter === "all" ? (
              <Link href={`/t/${slug}/products`} className={buttonClasses("secondary", "sm")}>
                {t("goToProducts")}
              </Link>
            ) : undefined
          }
        />
      )}

      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className={buttonClasses("secondary", "sm")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">{t("pageOf", { page, total: pages })}</span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className={buttonClasses("secondary", "sm")}>
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
