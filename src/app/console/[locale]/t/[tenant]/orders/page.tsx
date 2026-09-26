import type { Metadata } from "next";
import { Search, ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { AutoRefresh } from "@/components/admin/auto-refresh";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { OPEN_STATUSES, type OrderStatus } from "@/lib/commerce/orders";
import { formatMoney } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/orders">;

const VIEWS = ["open", "completed", "cancelled", "all"] as const;
type View = (typeof VIEWS)[number];
const PAGE_SIZE = 50;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("orders") };
}

export default async function OrdersPage({ params, searchParams }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const query = await searchParams;
  return (
    <ModuleGate context={context} moduleKey="orders">
      <Orders
        slug={slug}
        locale={locale}
        context={context}
        view={VIEWS.find((v) => v === query.view) ?? "open"}
        q={typeof query.q === "string" ? query.q.trim().slice(0, 100) : ""}
        page={Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1)}
      />
    </ModuleGate>
  );
}

async function Orders({
  slug,
  locale,
  context,
  view,
  q,
  page,
}: {
  slug: string;
  locale: Locale;
  context: TenantAdminContext;
  view: View;
  q: string;
  page: number;
}) {
  const t = await getTranslations("orders");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();

  let request = supabase
    .from("orders")
    .select("id, order_number, status, payment_status, fulfillment_type, total_minor, currency, contact, placed_at", {
      count: "exact",
    })
    .eq("tenant_id", context.tenant.id)
    .order("placed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (view === "open") request = request.in("status", [...OPEN_STATUSES]);
  if (view === "completed") request = request.eq("status", "completed");
  if (view === "cancelled") request = request.eq("status", "cancelled");
  if (q) {
    const needle = q.replace(/^#/, "");
    if (/^\d+$/.test(needle)) {
      request = request.eq("order_number", needle);
    } else {
      // Contact search (name, email or phone); escape PostgREST/LIKE specials.
      const safe = needle.replace(/[%_,()\\*]/g, " ").trim();
      request = request.or(
        `contact->>name.ilike.*${safe}*,contact->>email.ilike.*${safe}*,contact->>phone.ilike.*${safe}*`,
      );
    }
  }
  const { data: orders, count, error } = await request;
  if (error) throw new Error(`Failed to load orders: ${error.message}`);

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (patch: { view?: View; page?: number }) => {
    const next = { view, page, q, ...patch };
    const p = new URLSearchParams();
    if (next.view !== "open") p.set("view", next.view);
    if (next.q) p.set("q", next.q);
    if (next.page > 1) p.set("page", String(next.page));
    const s = p.toString();
    return `/t/${slug}/orders${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("viewLabel")} className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={href({ view: v, page: 1 })}
              aria-current={v === view ? "page" : undefined}
              className={
                v === view
                  ? "rounded-md bg-fg px-3 py-1.5 text-sm text-bg"
                  : "rounded-md px-3 py-1.5 text-sm text-muted hover:bg-fg/5 hover:text-fg"
              }
            >
              {t(`views.${v}`)}
            </Link>
          ))}
        </nav>
        <form method="get" role="search" className="relative sm:w-72">
          {view !== "open" ? <input type="hidden" name="view" value={view} /> : null}
          <label htmlFor="order-search" className="sr-only">
            {t("search")}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="order-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface ps-9 pe-3 text-base sm:text-sm"
          />
        </form>
      </div>

      {orders && orders.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("order")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("customer")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("statusLabel")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("fulfillment")}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => {
                const contact = (o.contact ?? {}) as { name?: string; phone?: string | null };
                return (
                  <tr key={o.id} className="hover:bg-bg/60">
                    <td className="px-4 py-3">
                      <Link href={`/t/${slug}/orders/${o.id}`} className="font-medium hover:underline">
                        #{o.order_number}
                      </Link>
                      <p className="text-xs text-muted">
                        {format.dateTime(new Date(o.placed_at), { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{contact.name ?? t("walkIn")}</p>
                      {contact.phone ? (
                        <p className="text-xs text-muted" dir="ltr">
                          {contact.phone}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        <OrderStatusBadge status={o.status as OrderStatus} />
                        {o.payment_status === "paid" ? <Badge tone="success">{t("paid")}</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3">{t(`fulfillmentType.${o.fulfillment_type as "pickup"}`)}</td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {formatMoney(
                        { amountMinor: BigInt(o.total_minor), currency: o.currency },
                        settings.exponent,
                        locale,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<ShoppingBag />}
          title={q || view !== "open" ? t("noResults") : t("emptyTitle")}
          description={q || view !== "open" ? t("noResultsBody") : t("emptyBody")}
          action={
            !q && view === "open" && context.permissions.includes("settings.read") ? (
              <Link href={`/t/${slug}/settings/checkout`} className={buttonClasses("secondary", "sm")}>
                {t("checkoutSettings")}
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
