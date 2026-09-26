import "server-only";

import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Customer reads. There is no write path here by design — a customer row is
 * only ever created or updated by `create_order_from_cart`/`create_dine_in_order`
 * at the moment of an order, never edited directly (see Phase 5 notes).
 */
export type CustomerRow = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  ordersCount: number;
  lifetimeValueMinor: bigint;
  lastOrderAt: string | null;
};

export async function getCustomer(context: TenantAdminContext, customerId: string): Promise<CustomerRow | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, email, phone, full_name, orders_count, lifetime_value_minor, last_order_at")
    .eq("tenant_id", context.tenant.id)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    phone: data.phone,
    fullName: data.full_name,
    ordersCount: data.orders_count,
    lifetimeValueMinor: BigInt(data.lifetime_value_minor),
    lastOrderAt: data.last_order_at,
  };
}

export async function searchCustomers(context: TenantAdminContext, query: string, limit = 20): Promise<CustomerRow[]> {
  const supabase = await createUserClient();
  const safe = query.trim().replace(/[%_]/g, "");
  let request = supabase
    .from("customers")
    .select("id, email, phone, full_name, orders_count, lifetime_value_minor, last_order_at")
    .eq("tenant_id", context.tenant.id)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (safe) request = request.or(`full_name.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*`);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    phone: c.phone,
    fullName: c.full_name,
    ordersCount: c.orders_count,
    lifetimeValueMinor: BigInt(c.lifetime_value_minor),
    lastOrderAt: c.last_order_at,
  }));
}
