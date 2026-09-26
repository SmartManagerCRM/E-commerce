import "server-only";

import type { Locale } from "@/i18n/locales";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import { getCart, getQuote, mapCart, type CartView, type Quote } from "@/server/commerce/storefront";
import { serviceClient } from "@/server/supabase/clients";

/**
 * Guest cart operations for a resolved storefront tenant. `tokenHash` is the
 * SHA-256 hash of the customer's cart cookie (`@/server/commerce/cart-cookie`)
 * — this module never sees, stores or accepts the raw token, matching the
 * invariant the whole checkout system relies on. `getCart`/`getQuote` are
 * re-exported as-is from `@/server/commerce/storefront`; `addItem`/`setItem`
 * are new, documented wrappers over `cart_update`.
 */
export { getCart, getQuote, type CartView, type Quote };

export type CartUpdateResult = CartView & { limited: boolean };

async function cartUpdate(
  tenant: ActiveStorefrontTenant,
  locale: Locale,
  tokenHash: string,
  variantId: string,
  qty: number,
  mode: "add" | "set",
): Promise<CartUpdateResult> {
  const { data, error } = await serviceClient().rpc("cart_update", {
    p_tenant: tenant.id,
    p_token_hash: tokenHash,
    p_variant: variantId,
    p_qty: qty,
    p_mode: mode,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to update cart");
  return mapCart({ tenant, locale }, data) as CartUpdateResult;
}

/** Adds to (mode `add`) an existing line's quantity, capped at real sellable stock. */
export async function addItem(
  tenant: ActiveStorefrontTenant,
  locale: Locale,
  tokenHash: string,
  variantId: string,
  qty: number,
): Promise<CartUpdateResult> {
  return cartUpdate(tenant, locale, tokenHash, variantId, qty, "add");
}

/** Sets a line's quantity outright; 0 removes it. */
export async function setItem(
  tenant: ActiveStorefrontTenant,
  locale: Locale,
  tokenHash: string,
  variantId: string,
  qty: number,
): Promise<CartUpdateResult> {
  return cartUpdate(tenant, locale, tokenHash, variantId, qty, "set");
}
