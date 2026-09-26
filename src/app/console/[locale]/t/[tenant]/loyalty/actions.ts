"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formDataToObject } from "@/lib/form-data";
import { loyaltyRewardSchema, loyaltySettingsSchema, loyaltyTierSchema } from "@/lib/validation/loyalty";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError, catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/loyalty";

export async function saveLoyaltySettings(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = loyaltySettingsSchema.safeParse({
    active: formData.get("active") === "on",
    points_per_currency_unit: formData.get("points_per_currency_unit"),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  const { data: current } = await supabase
    .from("tenant_settings")
    .select("loyalty")
    .eq("tenant_id", context.tenant.id)
    .single();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      loyalty: {
        ...((current?.loyalty as Record<string, unknown>) ?? {}),
        active: parsed.data.active,
        points_per_currency_unit: parsed.data.points_per_currency_unit,
      },
    })
    .eq("tenant_id", context.tenant.id);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}

export async function saveLoyaltyTier(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  const parsed = loyaltyTierSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const t = parsed.data;
  const row = {
    name: t.name,
    threshold_points: t.threshold_points,
    perks: t.perks,
    active: t.active,
    position: t.position,
  };
  const supabase = await createUserClient();
  const { error } = t.id
    ? await supabase.from("loyalty_tiers").update(row).eq("tenant_id", context.tenant.id).eq("id", t.id)
    : await supabase.from("loyalty_tiers").insert({ ...row, tenant_id: context.tenant.id });
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: t.id ? "saved" : "tierAdded" };
}

export async function deleteLoyaltyTier(slug: string, tierId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(tierId).success) return { status: "error", error: "notFound" };
  const supabase = await createUserClient();
  const { error } = await supabase.from("loyalty_tiers").delete().eq("tenant_id", context.tenant.id).eq("id", tierId);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "removed" };
}

export async function saveLoyaltyReward(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  const { exponent } = await catalogSettings(context);
  const parsed = loyaltyRewardSchema(exponent).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      error: parsed.error.issues.some((i) => i.message === "invalidPrice") ? "invalidPrice" : "invalid",
    };
  }
  const r = parsed.data;
  const row = {
    name: r.name,
    cost_points: r.cost_points,
    kind: r.kind,
    value: r.value,
    active: r.active,
    position: r.position,
  };
  const supabase = await createUserClient();
  const { error } = r.id
    ? await supabase.from("loyalty_rewards").update(row).eq("tenant_id", context.tenant.id).eq("id", r.id)
    : await supabase.from("loyalty_rewards").insert({ ...row, tenant_id: context.tenant.id });
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: r.id ? "saved" : "rewardAdded" };
}

export async function deleteLoyaltyReward(slug: string, rewardId: string, _prev: FormState): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(rewardId).success) return { status: "error", error: "notFound" };
  const supabase = await createUserClient();
  const { error } = await supabase.from("loyalty_rewards").delete().eq("tenant_id", context.tenant.id).eq("id", rewardId);
  if (error) return { status: "error", error: catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "removed" };
}
