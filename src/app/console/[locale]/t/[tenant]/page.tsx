import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { SectionCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { isLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import type { OrderStatus } from "@/lib/commerce/orders";
import { formatMoney } from "@/lib/money";
import { requireTenantAdmin } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

export async function generateMetadata({ params }: PageProps<"/console/[locale]/t/[tenant]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.dashboard" });
  return { title: t("title") };
}

type SalesSummary = {
  orders_today: number;
  revenue_today_minor: number;
  open_orders: number;
  pending_orders: number;
  customers: number;
};

/**
 * Dashboard: live figures for today (in the store's time zone), open orders,
 * catalog and stock. Trend analytics arrive with the analytics module.
 */
export default async function DashboardPage({ params }: PageProps<"/console/[locale]/t/[tenant]">) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);

  const t = await getTranslations("console.dashboard");
  const supabase = await createUserClient();
  const showCatalog = context.features.catalog?.enabled === true && context.permissions.includes("catalog.read");
  const showLowStock = context.features.inventory?.enabled === true && context.permissions.includes("inventory.read");
  const [activeProducts, lowStock] = await Promise.all([
    showCatalog
      ? supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", context.tenant.id)
          .eq("status", "active")
          .then((r) => r.count ?? 0)
      : null,
    showLowStock
      ? supabase
          .rpc("low_stock_items", { p_tenant: context.tenant.id, p_limit: 200 })
          .then((r) => (r.data ? r.data.length : null))
      : null,
  ]);
  const showSales = context.features.orders?.enabled === true && context.permissions.includes("orders.read");
  const [summary, recent, settings] = showSales
    ? await Promise.all([
        supabase
          .rpc("sales_summary", { p_tenant: context.tenant.id })
          .then((r) => (r.data as SalesSummary | null) ?? null),
        supabase
          .from("orders")
          .select("id, order_number, status, total_minor, currency, placed_at, contact")
          .eq("tenant_id", context.tenant.id)
          .order("placed_at", { ascending: false })
          .limit(5)
          .then((r) => r.data ?? []),
        catalogSettings(context),
      ])
    : [null, [], null];
  const money = (minor: number) =>
    settings ? formatMoney({ amountMinor: BigInt(minor), currency: settings.currency }, settings.exponent, locale) : "";
  const format = await getFormatter();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-sm text-muted">{t("welcome")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{context.tenant.businessName}</h1>
      </div>

      {summary ? (
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { key: "revenueToday", value: money(summary.revenue_today_minor) },
            { key: "ordersToday", value: String(summary.orders_today) },
            {
              key: "openOrders",
              value: String(summary.open_orders),
              href: `/t/${slug}/orders`,
              alert: summary.pending_orders > 0,
            },
            {
              key: "customers",
              value: String(summary.customers),
              href: context.permissions.includes("customers.read") ? `/t/${slug}/customers` : undefined,
            },
          ].map((kpi) => (
            <div key={kpi.key} className="rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
              <dt className="text-sm text-muted">{t(`kpi.${kpi.key as "revenueToday"}`)}</dt>
              <dd className={`mt-2 text-2xl font-semibold tabular-nums ${kpi.alert ? "text-primary" : ""}`}>
                {kpi.href ? (
                  <Link href={kpi.href} className="hover:underline">
                    {kpi.value}
                  </Link>
                ) : (
                  kpi.value
                )}
              </dd>
              {kpi.key === "openOrders" && summary.pending_orders > 0 ? (
                <p className="mt-1 text-xs text-primary">{t("pendingOrders", { count: summary.pending_orders })}</p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      {activeProducts !== null || lowStock !== null ? (
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {activeProducts !== null ? (
            <div className="rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
              <dt className="text-sm text-muted">{t("kpi.activeProducts")}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">
                <Link href={`/t/${slug}/products?status=active`} className="hover:underline">
                  {activeProducts}
                </Link>
              </dd>
            </div>
          ) : null}
          {lowStock !== null ? (
            <div className="rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
              <dt className="text-sm text-muted">{t("kpi.lowStock")}</dt>
              <dd className={`mt-2 text-2xl font-semibold tabular-nums ${lowStock > 0 ? "text-danger" : ""}`}>
                <Link href={`/t/${slug}/inventory?filter=low`} className="hover:underline">
                  {lowStock >= 200 ? "200+" : lowStock}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {showSales && recent.length > 0 ? (
        <SectionCard
          title={t("recentOrders")}
          actions={
            <Link href={`/t/${slug}/orders`} className="text-sm text-primary hover:underline">
              {t("allOrders")}
            </Link>
          }
        >
          <ul className="divide-y divide-border">
            {recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <Link href={`/t/${slug}/orders/${o.id}`} className="font-medium hover:underline">
                    #{o.order_number}
                  </Link>
                  <span className="truncate text-muted">{(o.contact as { name?: string }).name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">{format.relativeTime(new Date(o.placed_at))}</span>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                  <span className="tabular-nums">{money(o.total_minor)}</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : (
        <EmptyState icon={<ShoppingBag />} title={t("noOrdersTitle")} description={t("noOrdersBody")} />
      )}
    </div>
  );
}
