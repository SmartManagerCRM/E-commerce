import "server-only";

import type { OrderStatus } from "@/lib/commerce/orders";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Staff-facing order operations: the status workflow, manual payment
 * recording, and building a dine-in order directly (no guest cart — a
 * member of staff is standing at the table). Every write is a permission-
 * checked Postgres function; nothing here computes a price or accepts a
 * caller-supplied total.
 */
export type DineInLineInput = { variantId: string; qty: number };

/** Builds and prices a dine-in order for an open table session. Reserves stock, like any other order. */
export async function createDineInOrder(
  context: TenantAdminContext,
  input: { tableSessionId: string; items: DineInLineInput[]; notes?: string },
): Promise<{ orderId: string; orderNumber: string; totalMinor: bigint }> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("create_dine_in_order", {
    p_tenant: context.tenant.id,
    p_session: input.tableSessionId,
    p_items: input.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
    p_notes: input.notes ?? undefined,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to create dine-in order");
  const result = data as { order_id: string; order_number: string; total_minor: number | string };
  return { orderId: result.order_id, orderNumber: result.order_number, totalMinor: BigInt(result.total_minor) };
}

/** Advances (or cancels) an order. The database enforces the transition table and who may call it. */
export async function updateOrderStatus(
  context: TenantAdminContext,
  input: { orderId: string; status: OrderStatus; note?: string },
): Promise<OrderStatus> {
  const supabase = await createUserClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", context.tenant.id)
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) throw new Error("not_found");
  const { data, error } = await supabase.rpc("update_order_status", {
    p_order: input.orderId,
    p_status: input.status,
    p_note: input.note ?? undefined,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to update order status");
  return data as OrderStatus;
}

/** Records a payment collected at pickup, delivery or the table. Rejects a second payment on the same order. */
export async function recordOrderPayment(
  context: TenantAdminContext,
  input: { orderId: string; method: "cash" | "card_terminal" | "bank_transfer" },
): Promise<void> {
  const supabase = await createUserClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", context.tenant.id)
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) throw new Error("not_found");
  const { error } = await supabase.rpc("record_order_payment", { p_order: input.orderId, p_method: input.method });
  if (error) throw new Error(error.message);
}
