import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Locale } from "@/i18n/locales";
import { parseProblems, type CheckoutProblem, type Fulfillment, type OrderStatus } from "@/lib/commerce/orders";
import { pickLocalized } from "@/lib/localized";
import { publicMediaUrl } from "@/lib/storage";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import { serverEnv } from "@/server/env";
import { serviceClient } from "@/server/supabase/clients";

/**
 * Cart, checkout and order-status reads for the storefront. These go through
 * service-role-only database functions, always with the tenant resolved on
 * the server and the hashed cart/order token — never ids chosen by the browser
 * alone. Without the service key configured, ordering is simply unavailable.
 */
export function commerceConfigured(): boolean {
  return Boolean(serverEnv().SUPABASE_SECRET_KEY);
}

const amount = z.union([z.number(), z.string()]).transform((v) => BigInt(v));
const localizedText = z.unknown();

type Ctx = { tenant: ActiveStorefrontTenant; locale: Locale };
const text = (ctx: Ctx, value: unknown) => pickLocalized(value, ctx.locale, ctx.tenant.default_language);

// ---------------------------------------------------------------------------
// Ordering options
// ---------------------------------------------------------------------------
const optionsRow = z.object({
  ordering_open: z.boolean().nullable(),
  pickup: z.boolean().nullable(),
  delivery: z.boolean().nullable(),
  min_order_minor: amount.nullable(),
  tax_rate_bps: z.number(),
  tax_included: z.boolean(),
  zones: z.array(
    z.object({
      id: z.uuid(),
      name: localizedText,
      fee_minor: amount,
      min_order_minor: amount.nullable(),
      free_over_minor: amount.nullable(),
      eta_minutes: z.number().nullable(),
    }),
  ),
});

export type DeliveryZoneView = {
  id: string;
  name: string;
  feeMinor: bigint;
  minOrderMinor: bigint | null;
  freeOverMinor: bigint | null;
  etaMinutes: number | null;
};

export type CheckoutOptions = {
  orderingOpen: boolean;
  pickup: boolean;
  delivery: boolean;
  minOrderMinor: bigint | null;
  taxRateBps: number;
  taxIncluded: boolean;
  zones: DeliveryZoneView[];
};

const CLOSED: CheckoutOptions = {
  orderingOpen: false,
  pickup: false,
  delivery: false,
  minOrderMinor: null,
  taxRateBps: 0,
  taxIncluded: true,
  zones: [],
};

export const getCheckoutOptions = cache(async (tenant: ActiveStorefrontTenant, locale: Locale): Promise<CheckoutOptions> => {
  if (!commerceConfigured()) return CLOSED;
  const { data, error } = await serviceClient().rpc("storefront_checkout_options", { p_tenant: tenant.id });
  if (error || !data) return CLOSED;
  const row = optionsRow.parse(data);
  const ctx = { tenant, locale };
  return {
    orderingOpen: row.ordering_open === true,
    pickup: row.pickup === true,
    delivery: row.delivery === true,
    minOrderMinor: row.min_order_minor,
    taxRateBps: row.tax_rate_bps,
    taxIncluded: row.tax_included,
    zones: row.zones.map((z) => ({
      id: z.id,
      name: text(ctx, z.name),
      feeMinor: z.fee_minor,
      minOrderMinor: z.min_order_minor,
      freeOverMinor: z.free_over_minor,
      etaMinutes: z.eta_minutes,
    })),
  };
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
const lineStatus = z.enum(["ok", "unavailable", "out_of_stock", "insufficient_stock"]);
const cartRow = z.object({
  items: z.array(
    z.object({
      variant_id: z.uuid(),
      product_slug: z.string(),
      name: localizedText,
      options: z.array(z.object({ option: localizedText, value: localizedText })),
      image_path: z.string().nullable(),
      unit_price_minor: amount,
      compare_at_minor: amount.nullable(),
      qty: z.number().int(),
      line_total_minor: amount,
      status: lineStatus,
    }),
  ),
  item_count: z.number(),
  subtotal_minor: amount,
  limited: z.boolean().optional(),
});

export type CartLine = {
  variantId: string;
  href: string;
  name: string;
  options: string;
  image: string | null;
  unitPriceMinor: bigint;
  compareAtMinor: bigint | null;
  qty: number;
  lineTotalMinor: bigint;
  status: z.infer<typeof lineStatus>;
};

export type CartView = { items: CartLine[]; itemCount: number; subtotalMinor: bigint; limited: boolean };

export const EMPTY_CART: CartView = { items: [], itemCount: 0, subtotalMinor: BigInt(0), limited: false };

export function mapCart(ctx: Ctx, data: unknown): CartView {
  const row = cartRow.parse(data);
  return {
    items: row.items.map((i) => ({
      variantId: i.variant_id,
      href: `/products/${i.product_slug}`,
      name: text(ctx, i.name),
      options: i.options.map((o) => `${text(ctx, o.option)}: ${text(ctx, o.value)}`).join(" · "),
      image: publicMediaUrl(i.image_path),
      unitPriceMinor: i.unit_price_minor,
      compareAtMinor: i.compare_at_minor,
      qty: i.qty,
      lineTotalMinor: i.line_total_minor,
      status: i.status,
    })),
    itemCount: row.item_count,
    subtotalMinor: row.subtotal_minor,
    limited: row.limited === true,
  };
}

export const getCart = cache(
  async (tenant: ActiveStorefrontTenant, locale: Locale, tokenHash: string | null): Promise<CartView> => {
    if (!tokenHash || !commerceConfigured()) return EMPTY_CART;
    const { data, error } = await serviceClient().rpc("cart_view", { p_tenant: tenant.id, p_token_hash: tokenHash });
    if (error || !data) return EMPTY_CART;
    return mapCart({ tenant, locale }, data);
  },
);

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
const quoteRow = z.object({
  subtotal_minor: amount,
  delivery_fee_minor: amount,
  tax_minor: amount,
  total_minor: amount,
  item_count: z.number(),
  problems: z.unknown(),
  tax_rate_bps: z.number().optional(),
  tax_included: z.boolean().optional(),
});

export type Quote = {
  subtotalMinor: bigint;
  deliveryFeeMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  itemCount: number;
  problems: CheckoutProblem[];
};

export async function getQuote(
  tenant: ActiveStorefrontTenant,
  tokenHash: string,
  fulfillment: Fulfillment,
  zoneId: string | null,
): Promise<Quote | null> {
  const { data, error } = await serviceClient().rpc("checkout_quote", {
    p_tenant: tenant.id,
    p_token_hash: tokenHash,
    p_fulfillment: fulfillment,
    // Pickup has no zone; the function accepts null.
    p_zone: zoneId as string,
  });
  if (error || !data) return null;
  const row = quoteRow.parse(data);
  return {
    subtotalMinor: row.subtotal_minor,
    deliveryFeeMinor: row.delivery_fee_minor,
    taxMinor: row.tax_minor,
    totalMinor: row.total_minor,
    itemCount: row.item_count,
    problems: parseProblems(row.problems),
  };
}

// ---------------------------------------------------------------------------
// Customer order page
// ---------------------------------------------------------------------------
const orderRow = z.object({
  order_number: z.string(),
  status: z.string(),
  payment_status: z.string(),
  fulfillment_type: z.enum(["pickup", "delivery"]),
  delivery_zone_name: localizedText.nullable(),
  subtotal_minor: amount,
  delivery_fee_minor: amount,
  tax_minor: amount,
  tax_rate_bps: z.number(),
  tax_included: z.boolean(),
  total_minor: amount,
  currency: z.string(),
  contact: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable().optional() }),
  shipping_address: z.record(z.string(), z.string()).nullable(),
  notes: z.string().nullable(),
  placed_at: z.string(),
  cancel_reason: z.string().nullable(),
  items: z.array(
    z.object({
      snapshot: z.object({
        name: localizedText,
        sku: z.string().nullable().optional(),
        options: z.array(z.object({ option: localizedText, value: localizedText })).optional(),
        image_path: z.string().nullable().optional(),
      }),
      unit_price_minor: amount,
      qty: z.number(),
      total_minor: amount,
    }),
  ),
  history: z.array(z.object({ status: z.string(), at: z.string() })),
});

export type OrderItemView = {
  name: string;
  options: string;
  image: string | null;
  unitPriceMinor: bigint;
  qty: number;
  totalMinor: bigint;
};

export type CustomerOrderView = {
  number: string;
  status: OrderStatus;
  paid: boolean;
  fulfillment: Fulfillment;
  zoneName: string | null;
  subtotalMinor: bigint;
  deliveryFeeMinor: bigint;
  taxMinor: bigint;
  taxRateBps: number;
  taxIncluded: boolean;
  totalMinor: bigint;
  currency: string;
  contact: { name: string; email: string; phone: string | null };
  address: Record<string, string> | null;
  notes: string | null;
  placedAt: string;
  cancelReason: string | null;
  items: OrderItemView[];
  history: { status: OrderStatus; at: string }[];
};

export function mapOrderItems(ctx: Ctx, items: z.infer<typeof orderRow>["items"]): OrderItemView[] {
  return items.map((i) => ({
    name: text(ctx, i.snapshot.name),
    options: (i.snapshot.options ?? []).map((o) => `${text(ctx, o.option)}: ${text(ctx, o.value)}`).join(" · "),
    image: publicMediaUrl(i.snapshot.image_path ?? null),
    unitPriceMinor: i.unit_price_minor,
    qty: i.qty,
    totalMinor: i.total_minor,
  }));
}

export async function getCustomerOrder(
  tenant: ActiveStorefrontTenant,
  locale: Locale,
  number: string,
  tokenHash: string,
): Promise<CustomerOrderView | null> {
  if (!commerceConfigured() || !/^\d{1,12}$/.test(number)) return null;
  const { data, error } = await serviceClient().rpc("storefront_order", {
    p_tenant: tenant.id,
    p_number: number,
    p_token_hash: tokenHash,
  });
  if (error || !data) return null;
  const row = orderRow.parse(data);
  const ctx = { tenant, locale };
  return {
    number: row.order_number,
    status: row.status as OrderStatus,
    paid: row.payment_status === "paid",
    fulfillment: row.fulfillment_type,
    zoneName: row.delivery_zone_name ? text(ctx, row.delivery_zone_name) : null,
    subtotalMinor: row.subtotal_minor,
    deliveryFeeMinor: row.delivery_fee_minor,
    taxMinor: row.tax_minor,
    taxRateBps: row.tax_rate_bps,
    taxIncluded: row.tax_included,
    totalMinor: row.total_minor,
    currency: row.currency,
    contact: { name: row.contact.name, email: row.contact.email, phone: row.contact.phone ?? null },
    address: row.shipping_address,
    notes: row.notes,
    placedAt: row.placed_at,
    cancelReason: row.cancel_reason,
    items: mapOrderItems(ctx, row.items),
    history: row.history.map((h) => ({ status: h.status as OrderStatus, at: h.at })),
  };
}
