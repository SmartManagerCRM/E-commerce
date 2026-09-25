import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { requirePlatformAdmin } from "@/server/auth/platform";
import { createUserClient } from "@/server/supabase/clients";

export async function generateMetadata({ params }: PageProps<"/console/[locale]/platform">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.platform" });
  return { title: t("title") };
}

/**
 * Super Admin entry point (full module in Phase 12). Access requires a row
 * in platform_admins; the data itself is also protected by RLS, so a tenant
 * admin gets nothing even if this check were bypassed.
 */
export default async function PlatformAdminPage({ params }: PageProps<"/console/[locale]/platform">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);

  const supabase = await createUserClient();
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, slug, business_name, status, created_at, tenant_subscriptions(status, plans(key, name))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load tenants: ${error.message}`);

  const t = await getTranslations("console");
  const format = await getFormatter();

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← {t("tenants.title")}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("platform.title")}</h1>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("platform.businesses")}</h2>
        <Link href="/platform/tenants/new" className={buttonClasses("primary", "sm")}>
          {t("platform.newBusiness")}
        </Link>
      </div>

      {tenants.length === 0 ? (
        <EmptyState className="mt-4" icon={<Building2 />} title={t("platform.empty")} />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-bg text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("platform.business")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("platform.slug")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("platform.plan")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("platform.status")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("platform.created")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tenant) => {
                const current = tenant.tenant_subscriptions.find((s) =>
                  ["trialing", "active", "past_due"].includes(s.status),
                );
                return (
                  <tr key={tenant.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/platform/tenants/${tenant.id}`} className="hover:underline">
                        {tenant.business_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted" dir="ltr">
                      {tenant.slug}
                    </td>
                    <td className="px-4 py-3">
                      {current?.plans ? pickLocalized(current.plans.name, locale) : t("platform.noPlan")}
                    </td>
                    <td className="px-4 py-3">
                      {t(`tenants.status.${tenant.status as "active" | "onboarding" | "suspended" | "closed"}`)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {format.dateTime(new Date(tenant.created_at), { dateStyle: "medium" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
