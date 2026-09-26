import "server-only";

import type { BookingResourceKind, BookingStatus } from "@/lib/booking";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Staff-facing booking operations (branches → booking_resources → bookings).
 * Every write is either a permission-checked Postgres function or an
 * RLS-scoped table operation gated on `bookings.read`/`bookings.write` —
 * never a raw, unchecked query. Guest-facing booking (the storefront request
 * form and a customer's own tracking link) lives separately in
 * `@/server/booking/storefront`, the same split already used for orders
 * (`services/orders.ts` for staff vs. `commerce/storefront.ts` for guests).
 */
export type BookingResourceRow = {
  id: string;
  branchId: string;
  name: unknown;
  kind: BookingResourceKind;
  capacityMin: number | null;
  capacityMax: number | null;
  active: boolean;
  position: number;
};

export type BookingRow = {
  id: string;
  branchId: string;
  resourceId: string;
  customerId: string | null;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  guests: number;
  contact: { name: string; email: string; phone?: string | null };
  notes: string | null;
  source: "storefront" | "staff";
  createdAt: string;
};

export async function listBookingResources(context: TenantAdminContext): Promise<BookingResourceRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("booking_resources")
    .select("id, branch_id, name, kind, capacity_min, capacity_max, active, position")
    .eq("tenant_id", context.tenant.id)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    name: r.name,
    kind: r.kind as BookingResourceKind,
    capacityMin: r.capacity_min,
    capacityMax: r.capacity_max,
    active: r.active,
    position: r.position,
  }));
}

/** Creates or updates a bookable resource (a table, area, staff member or room). RLS enforces `bookings.write`. */
export async function saveBookingResource(
  context: TenantAdminContext,
  input: {
    id?: string;
    branchId: string;
    name: Record<string, string>;
    kind: BookingResourceKind;
    capacityMin?: number | null;
    capacityMax?: number | null;
    active: boolean;
    position: number;
  },
): Promise<string> {
  const supabase = await createUserClient();
  const row = {
    branch_id: input.branchId,
    name: input.name,
    kind: input.kind,
    capacity_min: input.capacityMin ?? null,
    capacity_max: input.capacityMax ?? null,
    active: input.active,
    position: input.position,
  };
  if (input.id) {
    const { error } = await supabase
      .from("booking_resources")
      .update(row)
      .eq("tenant_id", context.tenant.id)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase
    .from("booking_resources")
    .insert({ ...row, tenant_id: context.tenant.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create booking resource");
  return data.id;
}

export async function listBookings(
  context: TenantAdminContext,
  filter: { status?: BookingStatus[] } = {},
): Promise<BookingRow[]> {
  const supabase = await createUserClient();
  let query = supabase
    .from("bookings")
    .select("id, branch_id, resource_id, customer_id, status, period, guests, contact, notes, source, created_at")
    .eq("tenant_id", context.tenant.id)
    .order("created_at", { ascending: false });
  if (filter.status?.length) query = query.in("status", filter.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => toBookingRow(b));
}

export async function getBooking(context: TenantAdminContext, bookingId: string): Promise<BookingRow | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, branch_id, resource_id, customer_id, status, period, guests, contact, notes, source, created_at")
    .eq("tenant_id", context.tenant.id)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toBookingRow(data) : null;
}

/** Confirms, rejects, completes, marks a no-show, or cancels a booking. The database enforces the transition table. */
export async function updateBookingStatus(
  context: TenantAdminContext,
  input: { bookingId: string; status: BookingStatus },
): Promise<BookingStatus> {
  const supabase = await createUserClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", context.tenant.id)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) throw new Error("not_found");
  const { data, error } = await supabase.rpc("update_booking_status", {
    p_booking: input.bookingId,
    p_status: input.status,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to update booking status");
  return data as BookingStatus;
}

type BookingSelectRow = {
  id: string;
  branch_id: string;
  resource_id: string;
  customer_id: string | null;
  status: string;
  period: unknown;
  guests: number;
  contact: unknown;
  notes: string | null;
  source: string;
  created_at: string;
};

function toBookingRow(b: BookingSelectRow): BookingRow {
  const contact = b.contact as { name: string; email: string; phone?: string | null };
  const [startsAt, endsAt] = parseRange(String(b.period));
  return {
    id: b.id,
    branchId: b.branch_id,
    resourceId: b.resource_id,
    customerId: b.customer_id,
    status: b.status as BookingStatus,
    startsAt,
    endsAt,
    guests: b.guests,
    contact,
    notes: b.notes,
    source: b.source as "storefront" | "staff",
    createdAt: b.created_at,
  };
}

/** Postgres returns a `tstzrange` as `["2026-01-01 10:00:00+00","2026-01-01 11:00:00+00")` — normalize to ISO 8601. */
function parseRange(period: string): [string, string] {
  const match = /^[[(]"?([^,"]+)"?,"?([^,")]+)"?[)\]]$/.exec(period);
  if (!match) return [period, period];
  const toIso = (s: string) => new Date(s.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString();
  return [toIso(match[1]), toIso(match[2])];
}
