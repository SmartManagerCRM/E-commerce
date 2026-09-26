import type { Metadata } from "next";
import { CalendarDays, Search } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { AutoRefresh } from "@/components/admin/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { OPEN_BOOKING_STATUSES, type BookingStatus } from "@/lib/booking";
import { pickLocalized } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/bookings">;

const VIEWS = ["pending", "upcoming", "all"] as const;
type View = (typeof VIEWS)[number];
const PAGE_SIZE = 50;

const TONE: Record<BookingStatus, "outline" | "success" | "danger" | "neutral"> = {
  pending: "outline",
  confirmed: "success",
  rejected: "danger",
  cancelled: "neutral",
  completed: "neutral",
  no_show: "danger",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("bookings") };
}

export default async function BookingsPage({ params, searchParams }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const query = await searchParams;
  return (
    <ModuleGate context={context} moduleKey="bookings">
      <Bookings
        slug={slug}
        locale={locale}
        context={context}
        view={VIEWS.find((v) => v === query.view) ?? "pending"}
        q={typeof query.q === "string" ? query.q.trim().slice(0, 100) : ""}
        page={Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1)}
      />
    </ModuleGate>
  );
}

async function Bookings({
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
  const t = await getTranslations("bookings");
  const tStatus = await getTranslations("bookingStatus");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();

  let request = supabase
    .from("bookings")
    .select("id, resource_id, status, period, guests, contact, created_at", { count: "exact" })
    .eq("tenant_id", context.tenant.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (view === "pending") request = request.eq("status", "pending");
  if (view === "upcoming") request = request.in("status", [...OPEN_BOOKING_STATUSES]);
  if (q) {
    const safe = q.replace(/[%_,()\\*]/g, " ").trim();
    request = request.or(`contact->>name.ilike.*${safe}*,contact->>email.ilike.*${safe}*,contact->>phone.ilike.*${safe}*`);
  }
  const { data: bookings, count, error } = await request;
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);

  const resourceIds = [...new Set((bookings ?? []).map((b) => b.resource_id))];
  const { data: resources } = resourceIds.length
    ? await supabase.from("booking_resources").select("id, name").in("id", resourceIds)
    : { data: [] };
  const resourceName = new Map((resources ?? []).map((r) => [r.id, r.name]));

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (patch: { view?: View; page?: number }) => {
    const next = { view, page, q, ...patch };
    const p = new URLSearchParams();
    if (next.view !== "pending") p.set("view", next.view);
    if (next.q) p.set("q", next.q);
    if (next.page > 1) p.set("page", String(next.page));
    const s = p.toString();
    return `/t/${slug}/bookings${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        {context.permissions.includes("settings.read") ? (
          <Link href={`/t/${slug}/settings/booking`} className={buttonClasses("secondary", "sm")}>
            {t("bookingSettings")}
          </Link>
        ) : null}
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
          {view !== "pending" ? <input type="hidden" name="view" value={view} /> : null}
          <label htmlFor="booking-search" className="sr-only">
            {t("search")}
          </label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="booking-search"
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface ps-9 pe-3 text-base sm:text-sm"
          />
        </form>
      </div>

      {bookings && bookings.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("customer")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("resource")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("when")}
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  {t("guests")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("statusLabel")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((b) => {
                const contact = (b.contact ?? {}) as { name?: string; phone?: string | null };
                const range = /^[[(]"?([^,"]+)"?,/.exec(String(b.period));
                const starts = range ? new Date(range[1].replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) : null;
                return (
                  <tr key={b.id} className="hover:bg-bg/60">
                    <td className="px-4 py-3">
                      <Link href={`/t/${slug}/bookings/${b.id}`} className="font-medium hover:underline">
                        {contact.name ?? t("booking")}
                      </Link>
                      {contact.phone ? (
                        <p className="text-xs text-muted" dir="ltr">
                          {contact.phone}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {pickLocalized(resourceName.get(b.resource_id), locale, settings.defaultLocale)}
                    </td>
                    <td className="px-3 py-3">
                      {starts ? format.dateTime(starts, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-3 py-3">{b.guests}</td>
                    <td className="px-4 py-3">
                      <Badge tone={TONE[b.status as BookingStatus]}>{tStatus(b.status as BookingStatus)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays />}
          title={q || view !== "pending" ? t("noResults") : t("emptyTitle")}
          description={q || view !== "pending" ? t("noResultsBody") : t("emptyBody")}
        />
      )}

      {pages > 1 ? (
        <nav aria-label={t("title")} className="flex items-center justify-between gap-4 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className={buttonClasses("secondary", "sm")}>
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} / {pages}
          </span>
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
