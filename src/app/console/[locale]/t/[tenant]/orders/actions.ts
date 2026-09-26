"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isLocale } from "@/i18n/locales";
import { ORDER_STATUSES } from "@/lib/commerce/orders";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError, catalogSettings } from "@/server/catalog/admin";
import { notifyOrderStatusChanged, notifyPaymentReceived } from "@/server/notifications/notify";
import { createUserClient } from "@/server/supabase/clients";

function changed() {
  revalidatePath("/console/[locale]/t/[tenant]/orders", "page");
  revalidatePath("/console/[locale]/t/[tenant]/orders/[id]", "page");
  revalidatePath("/console/[locale]/t/[tenant]", "page");
  revalidatePath("/console/[locale]/t/[tenant]/inventory", "page");
}

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

/** Moves an order along the workflow; the database checks the transition, stock and permissions. */
export async function changeOrderStatus(
  slug: string,
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "orders.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = statusSchema.safeParse({ status: formData.get("status"), note: formData.get("note") ?? undefined });
  if (!parsed.success || !z.uuid().safeParse(orderId).success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  // Scope to this console's tenant (RLS also hides other tenants' orders).
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, locale, contact")
    .eq("tenant_id", context.tenant.id)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { status: "error", error: "notFound" };
  const { error } = await supabase.rpc("update_order_status", {
    p_order: orderId,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? undefined,
  });
  if (error)
    return {
      status: "error",
      error: error.message === "invalid_transition" ? "invalidTransition" : catalogError(error.code),
    };
  changed();
  const settings = await catalogSettings(context);
  const contact = (order.contact ?? {}) as { name?: string; email?: string };
  if (contact.email) {
    await notifyOrderStatusChanged({
      tenantId: context.tenant.id,
      orderNumber: order.order_number,
      customerEmail: contact.email,
      locale: isLocale(order.locale) ? order.locale : settings.defaultLocale,
      businessName: context.tenant.businessName,
      currency: settings.currency,
      currencyExponent: settings.exponent,
      status: parsed.data.status,
    });
  }
  return { status: "success", message: "orderUpdated" };
}

export async function recordPayment(
  slug: string,
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "orders.write");
  if (!context) return { status: "error", error: "forbidden" };
  const method = z.enum(["cash", "card_terminal", "bank_transfer"]).safeParse(formData.get("method"));
  if (!method.success || !z.uuid().safeParse(orderId).success) return { status: "error", error: "invalid" };
  const supabase = await createUserClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, locale, contact, total_minor, currency")
    .eq("tenant_id", context.tenant.id)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { status: "error", error: "notFound" };
  const { error } = await supabase.rpc("record_order_payment", { p_order: orderId, p_method: method.data });
  if (error)
    return {
      status: "error",
      error: error.message === "already_paid_or_cancelled" ? "alreadyPaid" : catalogError(error.code),
    };
  changed();
  const settings = await catalogSettings(context);
  const contact = (order.contact ?? {}) as { name?: string; email?: string };
  if (contact.email) {
    await notifyPaymentReceived({
      tenantId: context.tenant.id,
      orderNumber: order.order_number,
      customerEmail: contact.email,
      locale: isLocale(order.locale) ? order.locale : settings.defaultLocale,
      businessName: context.tenant.businessName,
      currency: order.currency,
      currencyExponent: settings.exponent,
      totalMinor: BigInt(order.total_minor),
    });
  }
  return { status: "success", message: "paymentRecorded" };
}
