import "server-only";

import { z } from "zod";

import { isLocale } from "@/i18n/locales";
import { notifyNewOrderStaff, notifyPaymentReceived } from "@/server/notifications/notify";
import { serviceClient } from "@/server/supabase/clients";
import { consoleOrigin } from "@/server/tenant/urls";

import { moyasarProvider } from "./moyasar";
import type { PaymentProvider, ProviderSecrets, VerifiedWebhookEvent } from "./types";

/**
 * Orchestrates a payment provider against the database's provider-config and
 * order functions. Only Moyasar exists today; `providers` is keyed so a
 * second one is a lookup, not a rewrite.
 */
const providers: Record<string, PaymentProvider> = { moyasar: moyasarProvider };

const secretRow = z.object({
  secret_key: z.string(),
  webhook_secret: z.string(),
  mode: z.enum(["test", "live"]),
  public_config: z.object({ publishable_key: z.string().optional() }).nullable(),
  methods: z.array(z.string()),
});

async function loadSecrets(tenantId: string, provider: string): Promise<ProviderSecrets | null> {
  const { data, error } = await serviceClient().rpc("payment_provider_secret", { p_tenant: tenantId, p_provider: provider });
  if (error || !data) return null;
  const row = secretRow.safeParse(data);
  if (!row.success) return null;
  return { secretKey: row.data.secret_key, webhookSecret: row.data.webhook_secret, mode: row.data.mode };
}

/** Once, right when an online order first becomes paid: receipt to the customer, alert to the store. */
async function announceConfirmedPayment(tenantId: string, orderNumber: string): Promise<void> {
  const client = serviceClient();
  const { data: order } = await client
    .from("orders")
    .select("id, order_number, locale, contact, total_minor, currency, fulfillment_type")
    .eq("tenant_id", tenantId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return;
  const { data: tenant } = await client
    .from("tenants")
    .select("business_name, slug, default_language, currencies(exponent)")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return;
  const contact = order.contact as { name?: string; email?: string };
  const exponent = tenant.currencies?.exponent ?? 2;
  const locale = isLocale(order.locale) ? order.locale : isLocale(tenant.default_language) ? tenant.default_language : "en";

  if (contact.email) {
    await notifyPaymentReceived({
      tenantId,
      orderNumber: order.order_number,
      customerEmail: contact.email,
      locale,
      businessName: tenant.business_name,
      currency: order.currency,
      currencyExponent: exponent,
      totalMinor: BigInt(order.total_minor),
    });
  }
  await notifyNewOrderStaff({
    tenantId,
    businessName: tenant.business_name,
    orderNumber: order.order_number,
    orderId: order.id,
    consoleUrl: `${consoleOrigin()}/${locale}/t/${tenant.slug}/orders/${order.id}`,
    customerName: contact.name ?? "",
    fulfillment: order.fulfillment_type as "pickup" | "delivery",
    totalMinor: BigInt(order.total_minor),
    currency: order.currency,
    currencyExponent: exponent,
  });
}

export type InitiatePaymentResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

/** Creates the hosted payment session for a `pending_payment` order and records its reference. */
export async function initiatePayment(
  tenantId: string,
  order: { id: string; number: string; totalMinor: bigint; currency: string; description: string },
  callbackUrl: string,
  provider = "moyasar",
): Promise<InitiatePaymentResult> {
  const impl = providers[provider];
  const secrets = await loadSecrets(tenantId, provider);
  if (!impl || !secrets) return { ok: false, error: "online_payment_unavailable" };

  try {
    const session = await impl.createPayment(
      { orderId: order.id, orderNumber: order.number, amountMinor: order.totalMinor, currency: order.currency, description: order.description, callbackUrl },
      secrets,
    );
    const { error } = await serviceClient().rpc("set_payment_intent_ref", { p_order: order.id, p_ref: session.ref });
    if (error) return { ok: false, error: "generic" };
    return { ok: true, redirectUrl: session.redirectUrl };
  } catch {
    return { ok: false, error: "provider_error" };
  }
}

export type ResumeResult = { kind: "redirect"; url: string } | { kind: "paid" } | { kind: "unavailable" };

/**
 * Sends the customer back to a still-open payment session, or opens a new
 * one if none exists yet (e.g. the first attempt failed before a session was
 * created). Never opens a second session while a live one exists.
 */
export async function resumeOrCreatePayment(
  tenantId: string,
  order: { id: string; number: string; totalMinor: bigint; currency: string; description: string; paymentIntentRef: string | null },
  callbackUrl: string,
  provider = "moyasar",
): Promise<ResumeResult> {
  const impl = providers[provider];
  const secrets = await loadSecrets(tenantId, provider);
  if (!impl || !secrets) return { kind: "unavailable" };

  if (order.paymentIntentRef) {
    try {
      const status = await impl.fetchPayment(order.paymentIntentRef, secrets);
      if (status.paid) {
        const { data } = await serviceClient().rpc("confirm_online_payment", {
          p_provider: provider,
          p_provider_ref: status.ref,
          p_paid: true,
          p_amount_minor: Number(status.amountMinor),
          p_currency: status.currency,
          p_event_id: undefined,
          p_method: status.method ?? undefined,
        });
        const confirmResult = data as { result?: string; order_number?: string } | null;
        if (confirmResult?.result === "confirmed" && confirmResult.order_number) {
          await announceConfirmedPayment(tenantId, confirmResult.order_number);
        }
        return { kind: "paid" };
      }
      if (status.redirectUrl) return { kind: "redirect", url: status.redirectUrl };
    } catch {
      // Reference is stale or unreachable; fall through and open a fresh session.
    }
  }

  const result = await initiatePayment(tenantId, order, callbackUrl, provider);
  return result.ok ? { kind: "redirect", url: result.redirectUrl } : { kind: "unavailable" };
}

export type VerifyReturnResult = { orderNumber: string | null; confirmed: boolean };

/**
 * Called from the customer's return page after the provider redirects them
 * back. Never trusts the redirect's query string for payment status — it
 * re-fetches the payment from the provider before confirming anything.
 */
export async function verifyReturn(tenantId: string, ref: string, provider = "moyasar"): Promise<VerifyReturnResult> {
  const impl = providers[provider];
  const secrets = await loadSecrets(tenantId, provider);
  if (!impl || !secrets) return { orderNumber: null, confirmed: false };

  try {
    const status = await impl.fetchPayment(ref, secrets);
    const { data, error } = await serviceClient().rpc("confirm_online_payment", {
      p_provider: provider,
      p_provider_ref: status.ref,
      p_paid: status.paid,
      p_amount_minor: Number(status.amountMinor),
      p_currency: status.currency,
      p_event_id: undefined,
      p_method: status.method ?? undefined,
    });
    if (error) return { orderNumber: null, confirmed: false };
    const result = data as { result: string; order_number?: string };
    if (result.result === "confirmed" && result.order_number) {
      await announceConfirmedPayment(tenantId, result.order_number);
    }
    return { orderNumber: result.order_number ?? null, confirmed: result.result === "confirmed" || result.result === "already_paid" };
  } catch {
    return { orderNumber: null, confirmed: false };
  }
}

/** Applies a webhook event to the matching order. Looks up the tenant from the order the event references. */
export async function applyWebhookEvent(
  provider: string,
  rawBody: string,
  headers: Headers,
): Promise<{ handled: boolean }> {
  const impl = providers[provider];
  if (!impl) return { handled: false };

  // The webhook has no tenant host to resolve from; find the order by its
  // provider reference first (globally, via service role), then load that
  // tenant's secrets to verify the signature before trusting anything.
  const client = serviceClient();
  const bodyForRef = safeJson(rawBody);
  const ref = extractRef(bodyForRef);
  if (!ref) return { handled: false };
  const { data: order } = await client.from("orders").select("tenant_id").eq("payment_intent_ref", ref).maybeSingle();
  if (!order) return { handled: false };

  const secrets = await loadSecrets(order.tenant_id, provider);
  if (!secrets) return { handled: false };
  const event: VerifiedWebhookEvent | null = await impl.verifyWebhook(rawBody, headers, secrets);
  if (!event) return { handled: false };

  const { data } = await client.rpc("confirm_online_payment", {
    p_provider: provider,
    p_provider_ref: event.ref,
    p_paid: event.paid,
    p_amount_minor: Number(event.amountMinor),
    p_currency: event.currency,
    p_event_id: event.eventId,
    p_method: event.method ?? undefined,
  });
  const result = data as { result?: string; order_number?: string } | null;
  if (result?.result === "confirmed" && result.order_number) {
    await announceConfirmedPayment(order.tenant_id, result.order_number);
  }
  return { handled: true };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractRef(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: { invoice_id?: string; id?: string } }).data;
  return data?.invoice_id ?? data?.id ?? null;
}
