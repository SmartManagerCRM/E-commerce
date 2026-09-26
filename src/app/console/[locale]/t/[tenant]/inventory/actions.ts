"use server";

import { revalidatePath } from "next/cache";

import { formDataToObject } from "@/lib/form-data";
import type { FormState } from "@/lib/validation/common";
import { inventorySettingsSchema, stockAdjustmentSchema } from "@/lib/validation/catalog";
import { actionContext } from "@/server/admin/guards";
import { catalogError, catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

function changed() {
  revalidatePath("/console/[locale]/t/[tenant]/inventory", "page");
  revalidatePath("/console/[locale]/t/[tenant]/inventory/[item]", "page");
  revalidatePath("/console/[locale]/t/[tenant]/products", "page");
  revalidatePath("/console/[locale]/t/[tenant]/products/[id]", "page");
  revalidatePath("/console/[locale]/t/[tenant]", "page");
}

/** Manual stock change through the audited database function (never a direct update). */
export async function adjustStock(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "inventory.write");
  if (!context || context.features.inventory?.enabled !== true) return { status: "error", error: "forbidden" };
  const parsed = stockAdjustmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { inventory_item_id, direction, quantity, reason, note } = parsed.data;

  const supabase = await createUserClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("tenant_id", context.tenant.id)
    .eq("id", inventory_item_id)
    .maybeSingle();
  if (!item) return { status: "error", error: "notFound" };

  const { error } = await supabase.rpc("adjust_stock", {
    p_item: inventory_item_id,
    p_delta: direction === "add" ? quantity : -quantity,
    p_reason: reason,
    p_note: note ?? undefined,
  });
  if (error) return { status: "error", error: error.code === "23514" ? "negativeStock" : catalogError(error.code) };
  changed();
  return { status: "success", message: "stockUpdated" };
}

export async function updateInventorySettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "inventory.write");
  if (!context || context.features.inventory?.enabled !== true) return { status: "error", error: "forbidden" };
  const { exponent } = await catalogSettings(context);
  const parsed = inventorySettingsSchema(exponent).safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;

  const supabase = await createUserClient();
  const { error, count } = await supabase
    .from("inventory_items")
    .update(
      {
        min_stock: input.min_stock,
        track_stock: input.track_stock,
        allow_backorder: input.allow_backorder,
        cost_minor: input.cost === null ? null : Number(input.cost),
      },
      { count: "exact" },
    )
    .eq("tenant_id", context.tenant.id)
    .eq("id", input.inventory_item_id);
  if (error) return { status: "error", error: error.code === "23514" ? "backorderNeeded" : catalogError(error.code) };
  if (count === 0) return { status: "error", error: "notFound" };
  changed();
  return { status: "success", message: "saved" };
}
