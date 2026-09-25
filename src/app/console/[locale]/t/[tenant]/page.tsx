import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EmptyState } from "@/components/ui/empty-state";
import { isLocale } from "@/i18n/locales";
import { requireTenantAdmin } from "@/server/admin/context";

export async function generateMetadata({ params }: PageProps<"/console/[locale]/t/[tenant]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.dashboard" });
  return { title: t("title") };
}

/**
 * Dashboard shell. KPI tiles are wired to real aggregates in Phase 9; until
 * orders exist there is genuinely no data, so the tiles say so.
 */
export default async function DashboardPage({ params }: PageProps<"/console/[locale]/t/[tenant]">) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);

  const t = await getTranslations("console.dashboard");
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

      <EmptyState icon={<ShoppingBag />} title={t("noOrdersTitle")} description={t("noOrdersBody")} />
    </div>
  );
}
