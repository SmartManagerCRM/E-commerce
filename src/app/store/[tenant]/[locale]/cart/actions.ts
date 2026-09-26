"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { parseProblems, type CheckoutProblem } from "@/lib/commerce/orders";
import { formDataToObject } from "@/lib/form-data";
import { checkoutSchema, toOrderPayload } from "@/lib/validation/checkout";
import type { FormState } from "@/lib/validation/common";
import {
  cartTokenHash,
  ensureCartTokenHash,
  hashToken,
  newToken,
  resetCartCookie,
} from "@/server/commerce/cart-cookie";
import { commerceConfigured } from "@/server/commerce/storefront";
import { notifyNewOrderStaff, notifyOrderPlaced } from "@/server/notifications/notify";
import { clientIp, rateLimit } from "@/server/security/rate-limit";
import { serviceClient } from "@/server/supabase/clients";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";
import { consoleOrigin, storefrontOrigin } from "@/server/tenant/urls";

/**
 * Storefront cart and checkout actions. The store is always the one serving
 * this hostname; the browser only sends a variant id and a quantity (cart)
 * or contact details and a fulfillment choice (checkout). Prices, totals,
 * tax and stock are computed by the database.
 */
const CART_PAGE = "/store/[tenant]/[locale]/cart";
const cartInput = z.object({ variant_id: z.uuid(), qty: z.coerce.number().int().min(0).max(99) });

export type AddToCartResult =
  { status: "success"; count: number; limited: boolean } | { status: "error"; error: string };

function cartError(message: string | undefined): string {
  return message === "out_of_stock" || message === "unavailable" ? message : "generic";
}

async function limited(key: string, limit: number, windowMs: number) {
  return !rateLimit(`${key}:${clientIp(await headers())}`, limit, windowMs).ok;
}

export async function addToCart(variantId: string, qty: number): Promise<AddToCartResult> {
  const parsed = cartInput.safeParse({ variant_id: variantId, qty });
  if (!parsed.success || parsed.data.qty < 1) return { status: "error", error: "generic" };
  if (await limited("cart", 60, 60_000)) return { status: "error", error: "rateLimited" };
  const tenant = await requestStorefrontTenant();
  if (!tenant || !commerceConfigured()) return { status: "error", error: "generic" };

  const { data, error } = await serviceClient().rpc("cart_update", {
    p_tenant: tenant.id,
    p_token_hash: await ensureCartTokenHash(),
    p_variant: parsed.data.variant_id,
    p_qty: parsed.data.qty,
    p_mode: "add",
  });
  if (error || !data) return { status: "error", error: cartError(error?.message) };
  const cart = data as { item_count?: number; limited?: boolean };
  revalidatePath(CART_PAGE, "page");
  return { status: "success", count: cart.item_count ?? 0, limited: cart.limited === true };
}

/** Sets a line's quantity (0 removes it). Used by the cart page forms. */
export async function updateCartLine(formData: FormData): Promise<void> {
  const parsed = cartInput.safeParse({ variant_id: formData.get("variant_id"), qty: formData.get("qty") });
  if (!parsed.success || (await limited("cart", 60, 60_000))) return;
  const tenant = await requestStorefrontTenant();
  const tokenHash = await cartTokenHash();
  if (!tenant || !tokenHash || !commerceConfigured()) return;
  await serviceClient().rpc("cart_update", {
    p_tenant: tenant.id,
    p_token_hash: tokenHash,
    p_variant: parsed.data.variant_id,
    p_qty: parsed.data.qty,
    p_mode: "set",
  });
  revalidatePath(CART_PAGE, "page");
}

export type CheckoutState =
  FormState | { status: "error"; error: "checkoutProblems"; problems: CheckoutProblem[]; fieldErrors?: undefined };

const ORDER_ERRORS = new Set([
  "phone_required",
  "invalid_contact",
  "invalid_address",
  "empty_cart",
  "online_payment_unavailable",
  "pay_on_fulfillment_unavailable",
]);

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message === "required" ? "required" : "invalid";
    }
    return { status: "error", error: "checkoutInvalid", fieldErrors };
  }
  if (await limited("checkout", 10, 10 * 60_000)) return { status: "error", error: "rateLimited" };

  const tenant = await requestStorefrontTenant();
  const tokenHash = await cartTokenHash();
  if (!tenant || !commerceConfigured()) return { status: "error", error: "generic" };
  if (!tokenHash) return { status: "error", error: "empty_cart" };

  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : tenant.default_language;
  // The customer's private link to follow the order; only its hash is stored.
  const accessToken = newToken();
  const { data, error } = await serviceClient().rpc("create_order_from_cart", {
    p_tenant: tenant.id,
    p_token_hash: tokenHash,
    p_checkout: toOrderPayload(parsed.data, locale, hashToken(accessToken)),
  });
  if (error || !data) {
    if (error?.hint === "checkout_problems") {
      return { status: "error", error: "checkoutProblems", problems: parseProblems(error.message) };
    }
    return { status: "error", error: error && ORDER_ERRORS.has(error.message) ? error.message : "generic" };
  }

  const order = data as { order_id: string; order_number: string; status: string; payment_method: string; total_minor: string | number };
  await resetCartCookie();
  revalidatePath(CART_PAGE, "page");

  const orderUrl = `${storefrontOrigin(tenant)}/${locale}/orders/${order.order_number}?t=${accessToken}`;
  await notifyOrderPlaced({
    tenantId: tenant.id,
    orderNumber: order.order_number,
    customerEmail: parsed.data.email,
    locale,
    businessName: tenant.business_name,
    currency: tenant.currency,
    currencyExponent: tenant.currency_exponent,
    totalMinor: BigInt(order.total_minor),
    orderUrl,
  });
  // A pay-on-fulfillment order is real (and actionable) immediately; an online
  // order is only worth alerting the store about once payment is confirmed.
  if (order.payment_method === "pay_on_fulfillment") {
    await notifyNewOrderStaff({
      tenantId: tenant.id,
      businessName: tenant.business_name,
      orderNumber: order.order_number,
      orderId: order.order_id,
      consoleUrl: `${consoleOrigin()}/${locale}/t/${tenant.slug}/orders/${order.order_id}`,
      customerName: parsed.data.name,
      fulfillment: parsed.data.fulfillment,
      totalMinor: BigInt(order.total_minor),
      currency: tenant.currency,
      currencyExponent: tenant.currency_exponent,
    });
  }

  const href =
    order.status === "pending_payment"
      ? `/orders/${order.order_number}/pay?t=${accessToken}`
      : `/orders/${order.order_number}?t=${accessToken}`;
  redirect({ href, locale });
  return { status: "success" };
}
