"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formDataToObject } from "@/lib/form-data";
import { bookingResourceSchema, bookingSettingsSchema } from "@/lib/validation/booking";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError } from "@/server/catalog/admin";
import * as bookingsService from "@/server/services/bookings";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/settings/booking";

/** Accepting-bookings toggle plus timing rules. Merged into `tenant_settings.booking` (validated by the database too). */
export async function saveBookingSettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = bookingSettingsSchema.safeParse({
    accepting_bookings: formData.get("accepting_bookings") === "on",
    default_duration_minutes: formData.get("default_duration_minutes"),
    buffer_minutes: formData.get("buffer_minutes"),
    min_notice_minutes: formData.get("min_notice_minutes"),
    max_advance_days: formData.get("max_advance_days"),
    max_party_size: formData.get("max_party_size") ?? "",
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("booking")
    .eq("tenant_id", context.tenant.id)
    .single();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      booking: {
        ...((current?.booking as Record<string, unknown>) ?? {}),
        accepting_bookings: input.accepting_bookings,
        default_duration_minutes: input.default_duration_minutes,
        buffer_minutes: input.buffer_minutes,
        min_notice_minutes: input.min_notice_minutes,
        max_advance_days: input.max_advance_days,
        max_party_size: input.max_party_size,
      },
    })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}

export async function saveBookingResource(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = bookingResourceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", context.tenant.id)
    .eq("is_default", true)
    .maybeSingle();
  if (!branch) return { status: "error", error: "generic" };

  try {
    await bookingsService.saveBookingResource(context, {
      id: input.id ?? undefined,
      branchId: branch.id,
      name: input.name,
      kind: input.kind,
      capacityMin: input.capacity_min,
      capacityMax: input.capacity_max,
      active: input.active,
      position: input.position,
    });
  } catch {
    return { status: "error", error: "generic" };
  }
  revalidatePath(PATH, "page");
  return { status: "success", message: input.id ? "saved" : "resourceAdded" };
}

export async function deleteBookingResource(slug: string, resourceId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(resourceId).success) return { status: "error", error: "notFound" };
  const supabase = await createUserClient();
  const { error } = await supabase
    .from("booking_resources")
    .delete()
    .eq("tenant_id", context.tenant.id)
    .eq("id", resourceId);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "removed" };
}
