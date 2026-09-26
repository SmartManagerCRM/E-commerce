import "server-only";

import { timingSafeEqual } from "node:crypto";

import type {
  CreatePaymentInput,
  PaymentMethodKind,
  PaymentProvider,
  ProviderPaymentSession,
  ProviderPaymentStatus,
  ProviderSecrets,
  VerifiedWebhookEvent,
} from "./types";

/**
 * Moyasar (KSA: Mada, Visa/Mastercard, STC Pay). We use their Invoices API:
 * a hosted payment page we redirect the customer to, so card data never
 * reaches our servers. https://docs.moyasar.com/
 */
const API_BASE = "https://api.moyasar.com/v1";
const METHOD_MAP: Record<string, PaymentMethodKind> = {
  creditcard: "card",
  card: "card",
  mada: "mada",
  applepay: "applepay",
  stcpay: "stcpay",
};

function auth(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

function mapMethod(source: unknown): PaymentMethodKind | null {
  const type = typeof source === "object" && source && "type" in source ? String((source as { type: unknown }).type) : null;
  return type ? (METHOD_MAP[type] ?? null) : null;
}

type MoyasarInvoice = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  url: string;
  payments?: { source?: unknown }[];
};

async function moyasarFetch<T>(path: string, secretKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { authorization: auth(secretKey), "content-type": "application/json", ...init?.headers },
    // Payment calls must never be served from a stale cache.
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as T | { message?: string } | null;
  if (!res.ok) {
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : `Moyasar error ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const moyasarProvider: PaymentProvider = {
  key: "moyasar",

  supportedMethods(methods) {
    return methods.map((m) => METHOD_MAP[m]).filter((m): m is PaymentMethodKind => Boolean(m));
  },

  async createPayment(input: CreatePaymentInput, secrets: ProviderSecrets): Promise<ProviderPaymentSession> {
    const invoice = await moyasarFetch<MoyasarInvoice>("/invoices", secrets.secretKey, {
      method: "POST",
      body: JSON.stringify({
        amount: Number(input.amountMinor),
        currency: input.currency,
        description: input.description,
        callback_url: input.callbackUrl,
        metadata: { order_id: input.orderId, order_number: input.orderNumber },
      }),
    });
    return { ref: invoice.id, redirectUrl: invoice.url };
  },

  async fetchPayment(ref: string, secrets: ProviderSecrets): Promise<ProviderPaymentStatus> {
    const invoice = await moyasarFetch<MoyasarInvoice>(`/invoices/${ref}`, secrets.secretKey);
    const lastPayment = invoice.payments?.at(-1);
    return {
      ref: invoice.id,
      paid: invoice.status === "paid",
      status: invoice.status,
      amountMinor: BigInt(invoice.amount),
      currency: invoice.currency.toUpperCase(),
      method: lastPayment ? mapMethod(lastPayment.source) : null,
      redirectUrl: invoice.status === "initiated" ? invoice.url : null,
    };
  },

  async verifyWebhook(rawBody, _headers, secrets): Promise<VerifiedWebhookEvent | null> {
    let body: {
      id?: string;
      type?: string;
      secret_token?: string;
      data?: { id?: string; invoice_id?: string; status?: string; amount?: number; currency?: string; source?: unknown };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    // Moyasar signs webhooks by echoing the configured secret token in the body.
    const expected = Buffer.from(secrets.webhookSecret);
    const actual = Buffer.from(String(body.secret_token ?? ""));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const ref = body.data?.invoice_id ?? body.data?.id;
    if (!ref || !body.id || !body.data?.status || body.data.amount == null || !body.data.currency) return null;
    return {
      eventId: body.id,
      ref,
      paid: body.data.status === "paid",
      status: body.data.status,
      amountMinor: BigInt(body.data.amount),
      currency: body.data.currency.toUpperCase(),
      method: mapMethod(body.data.source),
    };
  },
};
