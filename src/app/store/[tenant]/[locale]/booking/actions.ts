"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { hashToken, newToken } from "@/server/commerce/cart-cookie";
import { commerceConfigured } from "@/server/commerce/storefront";
import { bookingRequestSchema } from "@/lib/validation/booking";
import { getAvailability } from "@/server/booking/storefront";
import { clientIp, rateLimit } from "@/server/security/rate-limit";
import { notifyBookingRequested, notifyNewBookingStaff } from "@/server/notifications/notify";
import { serviceClient } from "@/server/supabase/clients";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";
import { consoleOrigin, storefrontOrigin } from "@/server/tenant/urls";

import type { FormState } from "@/lib/validation/common";

async function limited(key: string, limit: number, windowMs: number) {
  return !rateLimit(`${key}:${clientIp(await headers())}`, limit, windowMs).ok;
}

/** Slots for one resource and date, refetched client-side as the customer changes either. */
export async function fetchSlots(resourceId: string, date: string): Promise<{ start: string; end: string }[]> {
  const tenant = await requestStorefrontTenant();
  if (!tenant || !commerceConfigured()) return [];
  if (await limited("booking-availability", 60, 60_000)) return [];
  return getAvailability(tenant, resourceId, date);
}

const BOOKING_ERRORS = new Set(["bookings_closed", "invalid_resource", "invalid_time", "too_far_ahead", "party_too_large", "slot_taken", "invalid_contact"]);

export async function requestBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = bookingRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message === "required" ? "required" : "invalid";
    }
    return { status: "error", error: "invalid", fieldErrors };
  }
  if (await limited("booking", 10, 10 * 60_000)) return { status: "error", error: "rateLimited" };

  const tenant = await requestStorefrontTenant();
  if (!tenant || !commerceConfigured()) return { status: "error", error: "generic" };
  const input = parsed.data;
  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : tenant.default_language;

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) return { status: "error", error: "invalid_time" };
  const slots = await getAvailability(tenant, input.resource_id, input.start.slice(0, 10));
  const slot = slots.find((s) => new Date(s.start).getTime() === start.getTime());
  if (!slot) return { status: "error", error: "slot_taken" };

  const accessToken = newToken();
  const { data, error } = await serviceClient().rpc("create_booking", {
    p_tenant: tenant.id,
    p_resource: input.resource_id,
    p_start: slot.start,
    p_end: slot.end,
    p_guests: input.guests,
    p_contact: { name: input.name, email: input.email, phone: input.phone },
    p_notes: input.notes ?? "",
    p_access_token_hash: hashToken(accessToken),
  });
  if (error || !data) {
    return { status: "error", error: error && BOOKING_ERRORS.has(error.message) ? error.message : "generic" };
  }

  const result = data as { booking_id: string };
  const bookingUrl = `${storefrontOrigin(tenant)}/${locale}/bookings/${result.booking_id}?t=${accessToken}`;
  await notifyBookingRequested({
    tenantId: tenant.id,
    customerEmail: input.email,
    locale,
    businessName: tenant.business_name,
    startsAt: slot.start,
    bookingUrl,
  });
  await notifyNewBookingStaff({
    tenantId: tenant.id,
    businessName: tenant.business_name,
    consoleUrl: `${consoleOrigin()}/${locale}/t/${tenant.slug}/bookings/${result.booking_id}`,
    customerName: input.name,
    guests: input.guests,
    startsAt: slot.start,
  });

  redirect({ href: `/bookings/${result.booking_id}?t=${accessToken}`, locale });
  return { status: "success" };
}

/** Guest self-cancel, reachable only with the private link — idempotent, mirrors the guest-order pattern. */
export async function cancelBooking(bookingId: string, tokenHash: string, _prev: FormState): Promise<FormState> {
  const tenant = await requestStorefrontTenant();
  if (!tenant || !commerceConfigured()) return { status: "error", error: "generic" };
  if (await limited("booking-cancel", 10, 10 * 60_000)) return { status: "error", error: "rateLimited" };
  const { data, error } = await serviceClient().rpc("cancel_booking_by_customer", {
    p_tenant: tenant.id,
    p_id: bookingId,
    p_token_hash: tokenHash,
  });
  if (error || !data) return { status: "error", error: "generic" };
  return { status: "success" };
}
