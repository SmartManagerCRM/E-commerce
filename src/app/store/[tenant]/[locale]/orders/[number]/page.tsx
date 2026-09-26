import type { Metadata } from "next";
import { Check, CircleX } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Money } from "@/components/store/money";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { progressSteps } from "@/lib/commerce/orders";
import { cn } from "@/lib/cn";
import { hashToken } from "@/server/commerce/cart-cookie";
import { getCustomerOrder } from "@/server/commerce/storefront";
import { requireStorePage } from "@/server/storefront/page-tenant";

type Props = PageProps<"/store/[tenant]/[locale]/orders/[number]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale, number } = await params;
  const { locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "store.order" });
  return { title: t("title", { number }), robots: { index: false, follow: false } };
}

/**
 * Order status for the customer, reachable only with the private link from
 * checkout (order number + token). Nothing here is indexable or guessable.
 */
export default async function OrderPage({ params, searchParams }: Props) {
  const { tenant: slug, locale: rawLocale, number } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const token = (await searchParams).t;
  if (typeof token !== "string" || !/^[\w-]{40,64}$/.test(token)) notFound();
  const order = await getCustomerOrder(tenant, locale, number, hashToken(token));
  if (!order) notFound();

  const t = await getTranslations("store.order");
  const tStatus = await getTranslations("orderStatus");
  const format = await getFormatter();
  const money = { currency: order.currency, exponent: tenant.currency_exponent };
  const steps = progressSteps(order.fulfillment);
  const reached = new Set(order.history.map((h) => h.status));
  const cancelled = order.status === "cancelled";
  const awaitingPayment = order.status === "pending_payment";
  const justPlaced =
    order.status === "pending" && order.history.every((h) => h.status === "pending" || h.status === "pending_payment");
  const rate = (order.taxRateBps / 100).toLocaleString(locale);

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {justPlaced ? (
        <div role="status" className="mb-8 rounded-lg border border-success/30 bg-success/10 p-5">
          <p className="flex items-center gap-2 font-semibold text-success">
            <Check className="size-5" aria-hidden="true" />
            {t("thanks")}
          </p>
          <p className="mt-1 text-sm">{t("received", { business: tenant.business_name })}</p>
          <p className="mt-1 text-sm text-muted">{t("keepLink")}</p>
        </div>
      ) : null}

      <h1 className="font-display text-display-md font-semibold">{t("title", { number: order.number })}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("placedOn", {
          date: format.dateTime(new Date(order.placedAt), { dateStyle: "medium", timeStyle: "short" }),
        })}
      </p>

      <section aria-labelledby="progress" className="mt-8">
        <h2 id="progress" className="sr-only">
          {t("progress")}
        </h2>
        {cancelled ? (
          <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger">
            <CircleX className="size-5" aria-hidden="true" />
            <span>
              {tStatus("cancelled")}
              {order.cancelReason ? ` — ${order.cancelReason}` : ""}
            </span>
          </p>
        ) : awaitingPayment ? (
          <div role="status" className="rounded-lg border border-accent/30 bg-accent/10 p-4">
            <p className="font-medium">{t("awaitingPayment")}</p>
            <p className="mt-1 text-sm text-muted">{t("awaitingPaymentBody")}</p>
            <Link
              href={`/orders/${order.number}/pay?t=${token}`}
              className="mt-3 inline-flex h-10 items-center rounded-button bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90"
            >
              {t("completePayment")}
            </Link>
          </div>
        ) : (
          <ol className="grid grid-cols-5 gap-2">
            {steps.map((step) => {
              const done = reached.has(step) || step === "pending";
              const current = order.status === step;
              return (
                <li key={step} className="flex flex-col gap-2" aria-current={current ? "step" : undefined}>
                  <span className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-border")} />
                  <span className={cn("text-xs", current ? "font-semibold text-fg" : done ? "text-fg" : "text-muted")}>
                    {tStatus(step)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="fulfillment">
          <h2 id="fulfillment" className="text-lg font-semibold">
            {order.fulfillment === "delivery" ? t("deliveryTo") : t("pickupAt")}
          </h2>
          <div className="mt-2 text-sm leading-relaxed">
            {order.fulfillment === "delivery" && order.address ? (
              <>
                <p>{order.address.line1}</p>
                {order.address.line2 ? <p>{order.address.line2}</p> : null}
                {order.address.city ? <p>{order.address.city}</p> : null}
                {order.zoneName ? <p className="text-muted">{order.zoneName}</p> : null}
              </>
            ) : (
              <p>{tenant.business_name}</p>
            )}
          </div>
        </section>
        <section aria-labelledby="payment">
          <h2 id="payment" className="text-lg font-semibold">
            {t("payment")}
          </h2>
          <p className="mt-2 text-sm">
            {order.paid
              ? t("paid")
              : order.paymentMethod === "online"
                ? t("awaitingPayment")
                : order.fulfillment === "delivery"
                  ? t("payOnDelivery")
                  : t("payOnPickup")}
          </p>
        </section>
      </div>

      <section aria-labelledby="items" className="mt-10">
        <h2 id="items" className="text-lg font-semibold">
          {t("items")}
        </h2>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {order.items.map((item, i) => (
            <li key={i} className="flex gap-3 py-3 text-sm">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-fg/[0.04]">
                {item.image ? <Image src={item.image} alt="" fill sizes="56px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.name} <span className="text-muted">× {item.qty}</span>
                </p>
                {item.options ? <p className="text-xs text-muted">{item.options}</p> : null}
              </div>
              <Money amount={item.totalMinor} {...money} />
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>{t("subtotal")}</dt>
            <dd>
              <Money amount={order.subtotalMinor} {...money} />
            </dd>
          </div>
          {order.fulfillment === "delivery" ? (
            <div className="flex justify-between">
              <dt>{t("deliveryFee")}</dt>
              <dd>
                <Money amount={order.deliveryFeeMinor} {...money} />
              </dd>
            </div>
          ) : null}
          {order.taxRateBps > 0 && !order.taxIncluded ? (
            <div className="flex justify-between">
              <dt>{t("taxAdded", { rate })}</dt>
              <dd>
                <Money amount={order.taxMinor} {...money} />
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>{t("total")}</dt>
            <dd>
              <Money amount={order.totalMinor} {...money} />
            </dd>
          </div>
          {order.taxRateBps > 0 && order.taxIncluded ? (
            <p className="text-xs text-muted">{t("taxIncluded", { rate })}</p>
          ) : null}
        </dl>
      </section>

      {tenant.phone || tenant.email ? (
        <p className="mt-10 text-sm text-muted">
          {t("questions", { business: tenant.business_name })}{" "}
          {tenant.phone ? (
            <a href={`tel:${tenant.phone.replace(/\s+/g, "")}`} className="font-medium text-fg underline" dir="ltr">
              {tenant.phone}
            </a>
          ) : null}
          {tenant.phone && tenant.email ? " · " : null}
          {tenant.email ? (
            <a
              href={`mailto:${tenant.email}?subject=${encodeURIComponent(t("title", { number: order.number }))}`}
              className="font-medium text-fg underline"
            >
              {tenant.email}
            </a>
          ) : null}
        </p>
      ) : null}
    </Container>
  );
}
