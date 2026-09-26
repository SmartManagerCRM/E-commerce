import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/customers">;
const PAGE_SIZE = 50;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("customers") };
}

export default async function CustomersPage({ params, searchParams }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const query = await searchParams;
  return (
    <ModuleGate context={context} moduleKey="customers">
      <Customers
        slug={slug}
        locale={locale}
        context={context}
        q={typeof query.q === "string" ? query.q.trim().slice(0, 100) : ""}
        page={Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1)}
      />
    </ModuleGate>
  );
}

async function Customers({
  slug,
  locale,
  context,
  q,
  page,
}: {
  slug: string;
  locale: Locale;
  context: TenantAdminContext;
  q: string;
  page: number;
}) {
  const t = await getTranslations("customers");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  let request = supabase
    .from("customers")
    .select("id, full_name, email, phone, orders_count, lifetime_value_minor, last_order_at, marketing_consent", {
      count: "exact",
    })
    .eq("tenant_id", context.tenant.id)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    const safe = q.replace(/[%_,()\\*]/g, " ").trim();
    request = request.or(`full_name.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*`);
  }
  const { data: customers, count, error } = await request;
  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: number) =>
    `/t/${slug}/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle", { count: count ?? 0 })}</p>
        </div>
        <form method="get" role="search" className="relative w-full sm:w-72">
          <label htmlFor="customer-search" className="sr-only">
            {t("search")}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="customer-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface ps-9 pe-3 text-base sm:text-sm"
          />
        </form>
      </div>

      {customers && customers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("customer")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("orders")}
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  {t("lifetimeValue")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("lastOrder")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-bg/60">
                  <td className="px-4 py-3">
                    <Link href={`/t/${slug}/customers/${c.id}`} className="font-medium hover:underline">
                      {c.full_name}
                    </Link>
                    <p className="text-xs text-muted" dir="ltr">
                      {c.email}
                    </p>
                    {c.marketing_consent ? (
                      <Badge tone="outline" className="mt-1">
                        {t("subscribed")}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-end tabular-nums">{c.orders_count}</td>
                  <td className="px-3 py-3 text-end tabular-nums">
                    {formatMoney(
                      { amountMinor: BigInt(c.lifetime_value_minor), currency: settings.currency },
                      settings.exponent,
                      locale,
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {c.last_order_at ? format.dateTime(new Date(c.last_order_at), { dateStyle: "medium" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title={q ? t("noResults") : t("emptyTitle")}
          description={q ? t("noResultsBody") : t("emptyBody")}
        />
      )}

      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonClasses("secondary", "sm")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">{t("pageOf", { page, total: pages })}</span>
          {page < pages ? (
            <Link href={href(page + 1)} className={buttonClasses("secondary", "sm")}>
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
