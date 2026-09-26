import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import type { OrderStatus } from "@/lib/commerce/orders";
import { formatMoney } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/customers/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("customers") };
}

export default async function CustomerPage({ params }: Props) {
  const { locale, tenant: slug, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="customers">
      <Detail slug={slug} locale={locale} id={id} context={context} />
    </ModuleGate>
  );
}

async function Detail({
  slug,
  locale,
  id,
  context,
}: {
  slug: string;
  locale: Locale;
  id: string;
  context: TenantAdminContext;
}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("customers");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();
  // Order history is shown only to members who may read orders (RLS returns nothing otherwise).
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, total_minor, currency, placed_at")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", id)
    .order("placed_at", { ascending: false })
    .limit(50);
  const money = (minor: number) =>
    formatMoney({ amountMinor: BigInt(minor), currency: settings.currency }, settings.exponent, locale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/t/${slug}/customers`} className="text-sm text-muted hover:text-fg">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{customer.full_name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:underline" dir="ltr">
            <Mail className="size-4 text-muted" aria-hidden="true" />
            {customer.email}
          </a>
          {customer.phone ? (
            <a
              href={`tel:${customer.phone.replace(/\s+/g, "")}`}
              className="flex items-center gap-1.5 hover:underline"
              dir="ltr"
            >
              <Phone className="size-4 text-muted" aria-hidden="true" />
              {customer.phone}
            </a>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("orders"), value: String(customer.orders_count) },
          { label: t("lifetimeValue"), value: money(customer.lifetime_value_minor) },
          {
            label: t("firstOrder"),
            value: customer.first_order_at
              ? format.dateTime(new Date(customer.first_order_at), { dateStyle: "medium" })
              : "—",
          },
          { label: t("marketing"), value: customer.marketing_consent ? t("consentYes") : t("consentNo") },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {customer.marketing_consent && customer.consent_at ? (
        <p className="text-xs text-muted">
          {t("consentAt", { date: format.dateTime(new Date(customer.consent_at), { dateStyle: "medium" }) })}
        </p>
      ) : null}

      <SectionCard title={t("orderHistory")}>
        {orders && orders.length > 0 ? (
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-3">
                  <Link href={`/t/${slug}/orders/${o.id}`} className="font-medium hover:underline">
                    #{o.order_number}
                  </Link>
                  <span className="text-muted">{format.dateTime(new Date(o.placed_at), { dateStyle: "medium" })}</span>
                </span>
                <span className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status as OrderStatus} />
                  <span className="tabular-nums">{money(o.total_minor)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noOrders")}</p>
        )}
      </SectionCard>
    </div>
  );
}
