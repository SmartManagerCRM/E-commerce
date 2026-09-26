import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EmptyState } from "@/components/ui/empty-state";
import { isLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { requireTenantAdmin } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

export async function generateMetadata({ params }: PageProps<"/console/[locale]/t/[tenant]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.dashboard" });
  return { title: t("title") };
}

/**
 * Dashboard. Sales KPI tiles are wired to real aggregates in Phase 9; until
 * orders exist there is genuinely no data, so the tiles say so. Catalog and
 * stock figures are live.
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
  const kpis = [
    { key: "revenueToday", show: true },
    { key: "ordersToday", show: true },
    { key: "customers", show: true },
    { key: "bookingsToday", show: context.features.booking?.enabled === true },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-sm text-muted">{t("welcome")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{context.tenant.businessName}</h1>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis
          .filter((k) => k.show)
          .map((kpi) => (
            <div key={kpi.key} className="rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
              <dt className="text-sm text-muted">{t(`kpi.${kpi.key}`)}</dt>
              <dd className="mt-2 text-sm font-medium text-muted">{t("noData")}</dd>
            </div>
          ))}
      </dl>

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

      <EmptyState icon={<ShoppingBag />} title={t("noOrdersTitle")} description={t("noOrdersBody")} />
    </div>
  );
}
