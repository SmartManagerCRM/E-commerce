import "server-only";

import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Stock reads and manual adjustments. `adjust_stock` is the single write
 * path (permission-checked, and it's the same ledger the order workflow's
 * reserve/deduct/release cycle writes to) — nothing here ever sets
 * `on_hand` directly.
 */
export type StockAdjustmentReason = "initial" | "restock" | "adjustment" | "damage" | "correction";

export type LowStockItem = {
  inventoryItemId: string;
  productId: string;
  variantId: string;
  sku: string | null;
  available: number;
  minStock: number;
};

/**
 * `_context` is unused directly — `adjust_stock` resolves the tenant from the
 * item id itself and checks `inventory.write` internally — but every service
 * function still takes a `TenantAdminContext` so the caller can never reach
 * this without first having a real, permission-resolved session.
 */
export async function adjustStock(
  _context: TenantAdminContext,
  input: { inventoryItemId: string; delta: number; reason: StockAdjustmentReason; note?: string },
): Promise<void> {
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_item: input.inventoryItemId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_note: input.note ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function lowStockItems(context: TenantAdminContext, limit = 50): Promise<LowStockItem[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("low_stock_items", { p_tenant: context.tenant.id, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    inventoryItemId: r.inventory_item_id,
    productId: r.product_id,
    variantId: r.variant_id,
    sku: r.sku,
    available: r.available,
    minStock: r.min_stock,
  }));
}
