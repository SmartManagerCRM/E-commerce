"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BOOKING_STATUSES } from "@/lib/booking";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogSettings } from "@/server/catalog/admin";
import { notifyBookingStatusChanged } from "@/server/notifications/notify";
import * as bookingsService from "@/server/services/bookings";
import { createUserClient } from "@/server/supabase/clients";

function changed() {
  revalidatePath("/console/[locale]/t/[tenant]/bookings", "page");
  revalidatePath("/console/[locale]/t/[tenant]/bookings/[id]", "page");
}

const statusSchema = z.object({ status: z.enum(BOOKING_STATUSES) });

/** Moves a booking along its workflow (confirm/reject/complete/no-show/cancel). The database enforces the transition. */
export async function changeBookingStatus(
  slug: string,
  bookingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "bookings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = statusSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success || !z.uuid().safeParse(bookingId).success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, contact")
    .eq("tenant_id", context.tenant.id)
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { status: "error", error: "notFound" };

  let result: Awaited<ReturnType<typeof bookingsService.updateBookingStatus>>;
  try {
    result = await bookingsService.updateBookingStatus(context, { bookingId, status: parsed.data.status });
  } catch (err) {
    return { status: "error", error: err instanceof Error && err.message === "invalid_transition" ? "invalidTransition" : "generic" };
  }
  changed();

  const settings = await catalogSettings(context);
  const contact = (booking.contact ?? {}) as { name?: string; email?: string };
  const full = await bookingsService.getBooking(context, bookingId);
  if (contact.email && full) {
    await notifyBookingStatusChanged({
      tenantId: context.tenant.id,
      customerEmail: contact.email,
      locale: settings.defaultLocale,
      businessName: context.tenant.businessName,
      startsAt: full.startsAt,
      status: result,
    });
  }
  return { status: "success", message: "bookingUpdated" };
}
