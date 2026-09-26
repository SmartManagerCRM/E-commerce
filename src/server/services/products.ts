import "server-only";

import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Staff-side product/variant reads (RLS-scoped to the caller's tenant).
 * Storefront-facing catalog reads (public, anonymous, price/availability
 * only) already live in `@/server/catalog/storefront` — this module is the
 * admin-side counterpart, for finding a product or variant id to act on
 * (e.g. before calling `services/tables`'s `createDineInOrder` or
 * `services/inventory`'s `adjustStock`).
 */
export type ProductSummary = {
  id: string;
  slug: string;
  name: unknown;
  status: string;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
};

export type VariantSummary = {
  id: string;
  sku: string | null;
  priceMinor: number;
  status: string;
  availableToSell: number | null;
};

export async function listProducts(
  context: TenantAdminContext,
  opts: { query?: string; status?: string; limit?: number } = {},
): Promise<ProductSummary[]> {
  const supabase = await createUserClient();
  let request = supabase
    .from("products")
    .select("id, slug, name, status, price_min_minor, price_max_minor")
    .eq("tenant_id", context.tenant.id)
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) request = request.eq("status", opts.status);
  if (opts.query) {
    const safe = opts.query.trim().replace(/[%_]/g, "");
    if (safe) request = request.ilike("search_text", `%${safe}%`);
  }
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    priceMinMinor: p.price_min_minor,
    priceMaxMinor: p.price_max_minor,
  }));
}

export async function listVariants(context: TenantAdminContext, productId: string): Promise<VariantSummary[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, sku, price_minor, status, inventory_items(on_hand, reserved, track_stock)")
    .eq("tenant_id", context.tenant.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => {
    const inv = Array.isArray(v.inventory_items) ? v.inventory_items[0] : v.inventory_items;
    return {
      id: v.id,
      sku: v.sku,
      priceMinor: v.price_minor,
      status: v.status,
      availableToSell: inv?.track_stock ? inv.on_hand - inv.reserved : null,
    };
  });
}
