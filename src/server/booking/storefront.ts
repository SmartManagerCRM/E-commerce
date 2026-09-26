import "server-only";

import { z } from "zod";

import type { Locale } from "@/i18n/locales";
import type { BookingResourceKind, BookingStatus } from "@/lib/booking";
import { pickLocalized } from "@/lib/localized";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import { serviceClient } from "@/server/supabase/clients";

/**
 * Guest booking reads/writes. Same invariants as the storefront cart/order
 * system (Phase 5): everything goes through `service_role`-only Postgres
 * functions with the tenant resolved from the request Host header, and the
 * customer's private tracking link carries a random token whose SHA-256
 * hash is the only thing ever stored.
 */
type Ctx = { tenant: ActiveStorefrontTenant; locale: Locale };
const localizedText = z.unknown();

const resourceRow = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  name: localizedText,
  kind: z.enum(["table", "area", "staff", "room"]),
  capacity_min: z.number().nullable(),
  capacity_max: z.number().nullable(),
});

const optionsRow = z.object({
  accepting_bookings: z.boolean().nullable(),
  default_duration_minutes: z.number(),
  min_notice_minutes: z.number(),
  max_advance_days: z.number(),
  max_party_size: z.number().nullable(),
  resources: z.array(resourceRow),
});

export type BookingResourceView = {
  id: string;
  branchId: string;
  name: string;
  kind: BookingResourceKind;
  capacityMin: number | null;
  capacityMax: number | null;
};

export type BookingOptions = {
  acceptingBookings: boolean;
  defaultDurationMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  maxPartySize: number | null;
  resources: BookingResourceView[];
};

const CLOSED: BookingOptions = {
  acceptingBookings: false,
  defaultDurationMinutes: 60,
  minNoticeMinutes: 30,
  maxAdvanceDays: 30,
  maxPartySize: null,
  resources: [],
};

export async function getBookingOptions(tenant: ActiveStorefrontTenant, locale: Locale): Promise<BookingOptions> {
  const { data, error } = await serviceClient().rpc("storefront_booking_options", { p_tenant: tenant.id });
  if (error || !data) return CLOSED;
  const row = optionsRow.parse(data);
  const ctx: Ctx = { tenant, locale };
  return {
    acceptingBookings: row.accepting_bookings === true,
    defaultDurationMinutes: row.default_duration_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    maxAdvanceDays: row.max_advance_days,
    maxPartySize: row.max_party_size,
    resources: row.resources.map((r) => ({
      id: r.id,
      branchId: r.branch_id,
      name: pickLocalized(r.name, ctx.locale, ctx.tenant.default_language),
      kind: r.kind,
      capacityMin: r.capacity_min,
      capacityMax: r.capacity_max,
    })),
  };
}

export type Slot = { start: string; end: string };

export async function getAvailability(tenant: ActiveStorefrontTenant, resourceId: string, date: string): Promise<Slot[]> {
  const { data, error } = await serviceClient().rpc("storefront_booking_availability", {
    p_tenant: tenant.id,
    p_resource: resourceId,
    p_date: date,
  });
  if (error || !Array.isArray(data)) return [];
  return z.array(z.object({ start: z.string(), end: z.string() })).parse(data);
}

const bookingRow = z.object({
  id: z.uuid(),
  status: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  guests: z.number(),
  notes: z.string().nullable(),
  contact: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable().optional() }),
  resource_name: localizedText,
  resource_kind: z.enum(["table", "area", "staff", "room"]),
  created_at: z.string(),
});

export type CustomerBookingView = {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  guests: number;
  notes: string | null;
  contact: { name: string; email: string; phone: string | null };
  resourceName: string;
  resourceKind: BookingResourceKind;
  createdAt: string;
};

export async function getCustomerBooking(
  tenant: ActiveStorefrontTenant,
  locale: Locale,
  bookingId: string,
  tokenHash: string,
): Promise<CustomerBookingView | null> {
  if (!z.uuid().safeParse(bookingId).success) return null;
  const { data, error } = await serviceClient().rpc("storefront_booking", {
    p_tenant: tenant.id,
    p_id: bookingId,
    p_token_hash: tokenHash,
  });
  if (error || !data) return null;
  const row = bookingRow.parse(data);
  return {
    id: row.id,
    status: row.status as BookingStatus,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    guests: row.guests,
    notes: row.notes,
    contact: { name: row.contact.name, email: row.contact.email, phone: row.contact.phone ?? null },
    resourceName: pickLocalized(row.resource_name, locale, tenant.default_language),
    resourceKind: row.resource_kind,
    createdAt: row.created_at,
  };
}
