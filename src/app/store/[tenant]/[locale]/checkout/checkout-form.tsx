"use client";

import { Bike, Store } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { TextArea, TextInput } from "@/components/forms/controls";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { CheckoutProblem } from "@/lib/commerce/orders";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

import type { CheckoutState } from "../cart/actions";

export type QuoteView = {
  subtotal: string;
  deliveryFee: string;
  tax: string;
  total: string;
  problems: CheckoutProblem[];
};
type Zone = {
  id: string;
  name: string;
  feeMinor: string;
  minOrderMinor: string | null;
  freeOverMinor: string | null;
  etaMinutes: number | null;
};

type Props = {
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
  currency: string;
  exponent: number;
  pickup: { address: string } | null;
  zones: Zone[];
  tax: { rateBps: number; included: boolean };
  quotes: Record<string, QuoteView | null>;
  lines: { id: string; name: string; options: string; image: string | null; qty: number; total: string }[];
  businessName: string;
  payment: { payOnFulfillment: boolean; onlinePayment: boolean };
};

export function CheckoutForm({ action, currency, exponent, pickup, zones, tax, quotes, lines, businessName, payment }: Props) {
  const t = useTranslations("store.checkout");
  const locale = useLocale() as Locale;
  const money = (minor: string | bigint) => formatMoney({ amountMinor: BigInt(minor), currency }, exponent, locale);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(pickup ? "pickup" : "delivery");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"pay_on_fulfillment" | "online">(
    payment.payOnFulfillment ? "pay_on_fulfillment" : "online",
  );
  const { state, pending, formProps } = useActionForm(action, { status: "idle" } as CheckoutState);

  const quote = quotes[fulfillment === "pickup" ? "pickup" : `delivery:${zoneId}`] ?? null;
  const problems = quote?.problems ?? [];
  const zone = zones.find((z) => z.id === zoneId);
  const fieldError = (name: string) => {
    const code = state.status === "error" ? state.fieldErrors?.[name] : undefined;
    return code ? t(`fieldErrors.${code === "required" ? "required" : "invalid"}`) : undefined;
  };
  const serverProblems = state.status === "error" && "problems" in state && state.problems ? state.problems : [];
  const rate = (tax.rateBps / 100).toLocaleString(locale);

  return (
    <form {...formProps} className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]" noValidate={false}>
      <div className="space-y-8">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-lg font-semibold">{t("howTitle")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {pickup ? (
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  fulfillment === "pickup" ? "border-fg bg-surface" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  value="pickup"
                  checked={fulfillment === "pickup"}
                  onChange={() => setFulfillment("pickup")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <Store className="size-4" aria-hidden="true" />
                    {t("pickup")}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{pickup.address || businessName}</span>
                </span>
              </label>
            ) : null}
            {zones.length > 0 ? (
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  fulfillment === "delivery" ? "border-fg bg-surface" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  value="delivery"
                  checked={fulfillment === "delivery"}
                  onChange={() => setFulfillment("delivery")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <Bike className="size-4" aria-hidden="true" />
                    {t("delivery")}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{t("deliveryHint")}</span>
                </span>
              </label>
            ) : null}
          </div>
        </fieldset>

        {fulfillment === "delivery" ? (
          <fieldset className="space-y-4">
            <legend className="mb-2 text-lg font-semibold">{t("addressTitle")}</legend>
            <div className="space-y-1.5">
              <label htmlFor="zone" className="block text-sm font-medium">
                {t("zone")}
              </label>
              <select
                id="zone"
                name="zone_id"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {BigInt(z.feeMinor) === BigInt(0) ? t("free") : money(z.feeMinor)}
                  </option>
                ))}
              </select>
              {zone ? (
                <p className="text-xs text-muted">
                  {[
                    zone.etaMinutes ? t("eta", { minutes: zone.etaMinutes }) : null,
                    zone.freeOverMinor ? t("freeOver", { amount: money(zone.freeOverMinor) }) : null,
                    zone.minOrderMinor ? t("minOrder", { amount: money(zone.minOrderMinor) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
            <TextInput
              label={t("line1")}
              name="address_line1"
              autoComplete="address-line1"
              required
              maxLength={200}
              error={fieldError("address_line1")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label={t("line2")} name="address_line2" autoComplete="address-line2" maxLength={200} />
              <TextInput label={t("city")} name="address_city" autoComplete="address-level2" maxLength={100} />
            </div>
            <TextInput label={t("deliveryNotes")} name="address_notes" maxLength={300} hint={t("deliveryNotesHint")} />
          </fieldset>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="mb-2 text-lg font-semibold">{t("contactTitle")}</legend>
          <TextInput
            label={t("name")}
            name="name"
            autoComplete="name"
            required
            maxLength={120}
            error={fieldError("name")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t("email")}
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              required
              maxLength={254}
              hint={t("emailHint")}
              error={fieldError("email")}
            />
            <TextInput
              label={fulfillment === "delivery" ? t("phoneRequired") : t("phone")}
              name="phone"
              type="tel"
              autoComplete="tel"
              dir="ltr"
              required={fulfillment === "delivery"}
              maxLength={24}
              error={fieldError("phone")}
            />
          </div>
          <TextArea label={t("notes")} name="notes" maxLength={1000} rows={3} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="marketing_consent" className="mt-0.5 size-4 shrink-0 accent-primary" />
            <span>{t("consent", { business: businessName })}</span>
          </label>
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pointer-events-none absolute size-px overflow-hidden opacity-0 [clip-path:inset(50%)]"
          />
        </fieldset>

        <fieldset aria-labelledby="payment-title" className="space-y-2">
          <legend id="payment-title" className="mb-2 text-lg font-semibold">
            {t("paymentTitle")}
          </legend>
          {payment.payOnFulfillment && payment.onlinePayment ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  paymentMethod === "pay_on_fulfillment" ? "border-fg bg-surface" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="pay_on_fulfillment"
                  checked={paymentMethod === "pay_on_fulfillment"}
                  onChange={() => setPaymentMethod("pay_on_fulfillment")}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm">{fulfillment === "delivery" ? t("payOnDelivery") : t("payOnPickup")}</span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  paymentMethod === "online" ? "border-fg bg-surface" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="online"
                  checked={paymentMethod === "online"}
                  onChange={() => setPaymentMethod("online")}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm">{t("payOnline")}</span>
              </label>
            </div>
          ) : (
            <>
              <input type="hidden" name="payment_method" value={paymentMethod} />
              <p className="rounded-lg border border-border bg-surface p-4 text-sm">
                {payment.onlinePayment ? t("payOnline") : fulfillment === "delivery" ? t("payOnDelivery") : t("payOnPickup")}
              </p>
            </>
          )}
        </fieldset>
      </div>

      <aside
        aria-labelledby="order-summary"
        className="h-fit space-y-4 rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-24"
      >
        <h2 id="order-summary" className="text-lg font-semibold">
          {t("summary")}
        </h2>
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-3 text-sm">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-fg/[0.04]">
                {line.image ? <Image src={line.image} alt="" fill sizes="56px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {line.name} <span className="text-muted">× {line.qty}</span>
                </p>
                {line.options ? <p className="text-xs text-muted">{line.options}</p> : null}
              </div>
              <p className="tabular-nums">{money(line.total)}</p>
            </li>
          ))}
        </ul>
        {quote ? (
          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt>{t("subtotal")}</dt>
              <dd className="tabular-nums">{money(quote.subtotal)}</dd>
            </div>
            {fulfillment === "delivery" ? (
              <div className="flex justify-between">
                <dt>{t("deliveryFee")}</dt>
                <dd className="tabular-nums">
                  {BigInt(quote.deliveryFee) === BigInt(0) ? t("free") : money(quote.deliveryFee)}
                </dd>
              </div>
            ) : null}
            {tax.rateBps > 0 && !tax.included ? (
              <div className="flex justify-between">
                <dt>{t("taxAdded", { rate })}</dt>
                <dd className="tabular-nums">{money(quote.tax)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>{t("total")}</dt>
              <dd className="tabular-nums">{money(quote.total)}</dd>
            </div>
            {tax.rateBps > 0 && tax.included ? (
              <p className="text-xs text-muted">{t("taxIncluded", { rate, amount: money(quote.tax) })}</p>
            ) : null}
          </dl>
        ) : null}

        {[...new Set([...problems, ...serverProblems])].map((p) => (
          <p key={p} role="alert" className="text-sm text-danger">
            {t(`problems.${p}`)}
          </p>
        ))}
        {state.status === "error" && state.error !== "checkoutProblems" ? (
          <p role="alert" className="text-sm text-danger">
            {t.has(`errors.${state.error}` as "errors.generic")
              ? t(`errors.${state.error}` as "errors.generic")
              : t("errors.generic")}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || problems.length > 0 || !quote}
          className="inline-flex h-12 w-full items-center justify-center rounded-button bg-primary px-6 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? t("placing")
            : quote
              ? t(paymentMethod === "online" ? "payNow" : "placeOrder", { total: money(quote.total) })
              : t("placeOrderPlain")}
        </button>
        <p className="text-xs text-muted">{t("placeHint")}</p>
      </aside>
    </form>
  );
}
