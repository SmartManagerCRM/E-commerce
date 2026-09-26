"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formDataToObject } from "@/lib/form-data";
import { toMinorUnits } from "@/lib/money";
import { commerceSettingsSchema } from "@/lib/validation/checkout";
import type { FormState } from "@/lib/validation/common";
import { requiredLocalized } from "@/lib/validation/common";
import { moneyInput } from "@/lib/validation/catalog";
import { actionContext } from "@/server/admin/guards";
import { catalogError, catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/settings/checkout";
const checked = (formData: FormData, name: string) => formData.get(name) === "on";

/** Ordering, payment-on-fulfillment, minimum order and VAT. Merged into tenant_settings (validated by the database too). */
export async function saveCommerceSettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const { exponent } = await catalogSettings(context);
  const toMinor = (v: string) => {
    try {
      const minor = toMinorUnits(v.replace(",", "."), exponent);
      return minor >= BigInt(0) && minor < BigInt(10) ** BigInt(12) ? minor : null;
    } catch {
      return null;
    }
  };
  const parsed = commerceSettingsSchema(toMinor).safeParse({
    accepting_orders: checked(formData, "accepting_orders"),
    pickup: checked(formData, "pickup"),
    delivery: checked(formData, "delivery"),
    pay_on_fulfillment: checked(formData, "pay_on_fulfillment"),
    min_order: String(formData.get("min_order") ?? ""),
    tax_rate: String(formData.get("tax_rate") ?? "0"),
    tax_included: checked(formData, "tax_included"),
    tax_registration_number: String(formData.get("tax_registration_number") ?? ""),
  });
  if (!parsed.success) {
    const messages = new Set(parsed.error.issues.map((i) => i.message));
    return {
      status: "error",
      error: messages.has("invalidRate") ? "invalidRate" : messages.has("invalidPrice") ? "invalidPrice" : "invalid",
    };
  }
  const input = parsed.data;
  if (input.accepting_orders && !input.pickup && !input.delivery) return { status: "error", error: "needFulfillment" };

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("checkout, tax")
    .eq("tenant_id", context.tenant.id)
    .single();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      checkout: {
        ...((current?.checkout as Record<string, unknown>) ?? {}),
        accepting_orders: input.accepting_orders,
        pickup: input.pickup,
        delivery: input.delivery,
        pay_on_fulfillment: input.pay_on_fulfillment,
        min_order_minor: input.min_order === null ? null : Number(input.min_order),
      },
      tax: {
        ...((current?.tax as Record<string, unknown>) ?? {}),
        rate_bps: input.tax_rate,
        included: input.tax_included,
        registration_number: input.tax_registration_number,
      },
    })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}

const zoneSchema = (exponent: number) =>
  z.object({
    id: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
    name: requiredLocalized(80),
    fee: moneyInput(exponent),
    min_order: z
      .string()
      .trim()
      .optional()
      .transform((v) => v ?? "")
      .pipe(z.union([z.literal("").transform(() => null), moneyInput(exponent)])),
    free_over: z
      .string()
      .trim()
      .optional()
      .transform((v) => v ?? "")
      .pipe(z.union([z.literal("").transform(() => null), moneyInput(exponent)])),
    eta_minutes: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(10080)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    active: z
      .literal("on")
      .optional()
      .transform((v) => v === "on"),
    position: z.coerce.number().int().min(0).max(1000).optional().default(0),
  });

export async function saveZone(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  const { exponent } = await catalogSettings(context);
  const parsed = zoneSchema(exponent).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.issues.some((i) => i.message === "invalidPrice") ? "invalidPrice" : "invalid",
    };
  }
  const z0 = parsed.data;
  const row = {
    name: z0.name,
    fee_minor: Number(z0.fee),
    min_order_minor: z0.min_order === null ? null : Number(z0.min_order),
    free_over_minor: z0.free_over === null ? null : Number(z0.free_over),
    eta_minutes: z0.eta_minutes,
    active: z0.active,
    position: z0.position,
  };
  const supabase = await createUserClient();
  const { error } = z0.id
    ? await supabase.from("delivery_zones").update(row).eq("tenant_id", context.tenant.id).eq("id", z0.id)
    : await supabase.from("delivery_zones").insert({ ...row, tenant_id: context.tenant.id });
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: z0.id ? "saved" : "zoneAdded" };
}

export async function deleteZone(slug: string, zoneId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(zoneId).success) return { status: "error", error: "notFound" };
  const supabase = await createUserClient();
  // Past orders keep the zone name and fee they were placed with.
  const { error } = await supabase.from("delivery_zones").delete().eq("tenant_id", context.tenant.id).eq("id", zoneId);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "removed" };
}
