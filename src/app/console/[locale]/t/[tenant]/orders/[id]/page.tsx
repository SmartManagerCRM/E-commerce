import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { nextStatuses, type Fulfillment, type OrderStatus } from "@/lib/commerce/orders";
import { pickLocalized } from "@/lib/localized";
import { formatMoney } from "@/lib/money";
import { publicMediaUrl } from "@/lib/storage";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { changeOrderStatus, recordPayment } from "../actions";
import { PaymentForm, StatusActions } from "./order-actions";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/orders/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("orders") };
}

export default async function OrderDetailPage({ params }: Props) {
  const { locale, tenant: slug, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="orders">
      <Detail slug={slug} locale={locale} id={id} context={context} />
    </ModuleGate>
  );
}

type Snapshot = {
  name?: unknown;
  sku?: string | null;
  options?: { option: unknown; value: unknown }[];
  image_path?: string | null;
};

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
  const t = await getTranslations("orders");
  const tStatus = await getTranslations("orderStatus");
  const format = await getFormatter();
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(*), payments(*)")
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const money = (minor: number) =>
    formatMoney({ amountMinor: BigInt(minor), currency: order.currency }, settings.exponent, locale);
  const pick = (v: unknown) => pickLocalized(v, locale, settings.defaultLocale);
  const contact = order.contact as { name: string; email: string; phone?: string | null };
  const address = order.shipping_address as Record<string, string> | null;
  const canWrite = context.permissions.includes("orders.write");
  const status = order.status as OrderStatus;
  const next = nextStatuses(status, order.fulfillment_type as Fulfillment);
  const items = [...(order.order_items ?? [])].sort((a, b) => a.position - b.position);
  const history = [...(order.order_status_history ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const payment = (order.payments ?? [])[0];
  const rate = (order.tax_rate_bps / 100).toLocaleString(locale);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/t/${slug}/orders`} className="text-sm text-muted hover:text-fg">
          ← {t("title")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("orderNumber", { number: order.order_number })}</h1>
          <OrderStatusBadge status={status} />
          <Badge tone={order.payment_status === "paid" ? "success" : "outline"}>
            {order.payment_status === "paid" ? t("paid") : t("unpaid")}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {format.dateTime(new Date(order.placed_at), { dateStyle: "full", timeStyle: "short" })} ·{" "}
          {t(`fulfillmentType.${order.fulfillment_type as "pickup"}`)}
        </p>
      </div>

      {canWrite && next.length > 0 ? (
        <SectionCard title={t("nextStep")}>
          <StatusActions action={changeOrderStatus.bind(null, slug, order.id)} next={next} />
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SectionCard title={t("items")}>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const snap = item.snapshot as Snapshot;
              const image = publicMediaUrl(snap.image_path ?? null);
              return (
                <li key={item.id} className="flex gap-3 py-3 text-sm">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-bg">
                    {image ? <Image src={image} alt="" fill sizes="48px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {pick(snap.name)} <span className="text-muted">× {item.qty}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {(snap.options ?? []).map((o) => `${pick(o.option)}: ${pick(o.value)}`).join(" · ")}
                      {snap.sku ? <span dir="ltr"> {snap.sku}</span> : null}
                    </p>
                  </div>
                  <p className="tabular-nums">{money(item.total_minor)}</p>
                </li>
              );
            })}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt>{t("subtotal")}</dt>
              <dd className="tabular-nums">{money(order.subtotal_minor)}</dd>
            </div>
            {order.fulfillment_type === "delivery" ? (
              <div className="flex justify-between">
                <dt>{t("deliveryFee")}</dt>
                <dd className="tabular-nums">{money(order.delivery_fee_minor)}</dd>
              </div>
            ) : null}
            {order.tax_rate_bps > 0 ? (
              <div className="flex justify-between text-muted">
                <dt>{order.tax_included ? t("taxIncluded", { rate }) : t("taxAdded", { rate })}</dt>
                <dd className="tabular-nums">{money(order.tax_minor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums">{money(order.total_minor)}</dd>
            </div>
          </dl>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title={t("customer")}>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{contact.name}</p>
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted" aria-hidden="true" />
                <a href={`mailto:${contact.email}`} className="hover:underline" dir="ltr">
                  {contact.email}
                </a>
              </p>
              {contact.phone ? (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted" aria-hidden="true" />
                  <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="hover:underline" dir="ltr">
                    {contact.phone}
                  </a>
                </p>
              ) : null}
              {order.customer_id && context.permissions.includes("customers.read") ? (
                <Link
                  href={`/t/${slug}/customers/${order.customer_id}`}
                  className="inline-block pt-1 text-primary hover:underline"
                >
                  {t("customerProfile")}
                </Link>
              ) : null}
            </div>
          </SectionCard>

          {order.fulfillment_type === "delivery" && address ? (
            <SectionCard title={t("deliveryAddress")}>
              <div className="space-y-0.5 text-sm">
                <p>{address.line1}</p>
                {address.line2 ? <p>{address.line2}</p> : null}
                {address.city ? <p>{address.city}</p> : null}
                {order.delivery_zone_name ? <p className="text-muted">{pick(order.delivery_zone_name)}</p> : null}
                {address.notes ? <p className="pt-2 text-muted">{address.notes}</p> : null}
              </div>
            </SectionCard>
          ) : null}

          {order.notes ? (
            <SectionCard title={t("customerNotes")}>
              <p className="text-sm whitespace-pre-line">{order.notes}</p>
            </SectionCard>
          ) : null}

          <SectionCard title={t("payment")}>
            {payment ? (
              <p className="text-sm">
                {t("paidWith", {
                  method: t(`methods.${payment.method as "cash"}`),
                  date: format.dateTime(new Date(payment.paid_at), { dateStyle: "medium", timeStyle: "short" }),
                })}
              </p>
            ) : status === "cancelled" ? (
              <p className="text-sm text-muted">{t("unpaid")}</p>
            ) : canWrite ? (
              <PaymentForm action={recordPayment.bind(null, slug, order.id)} total={money(order.total_minor)} />
            ) : (
              <p className="text-sm text-muted">{t("payOnFulfillment")}</p>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title={t("history")}>
        <ol className="space-y-3 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-3">
              <span className="text-muted tabular-nums">
                {format.dateTime(new Date(h.at), { dateStyle: "short", timeStyle: "short" })}
              </span>
              <span className="font-medium">
                {h.note?.startsWith("payment:")
                  ? t("paymentRecorded", { method: t(`methods.${h.note.slice(8) as "cash"}`) })
                  : tStatus(h.to_status as OrderStatus)}
              </span>
              {h.note && !h.note.startsWith("payment:") ? <span className="text-muted">— {h.note}</span> : null}
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
