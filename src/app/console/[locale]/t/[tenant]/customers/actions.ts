"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { loyaltyAdjustSchema } from "@/lib/validation/loyalty";
import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import * as loyaltyService from "@/server/services/loyalty";

const PATH = "/console/[locale]/t/[tenant]/customers/[id]";

export async function adjustCustomerPoints(
  slug: string,
  customerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(customerId).success) return { status: "error", error: "notFound" };
  const parsed = loyaltyAdjustSchema.safeParse({ delta: formData.get("delta"), note: formData.get("note") ?? undefined });
  if (!parsed.success) return { status: "error", error: "invalid" };

  try {
    await loyaltyService.adjustLoyaltyPoints(context, {
      customerId,
      delta: parsed.data.delta,
      note: parsed.data.note,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { status: "error", error: message === "invalid_delta" || message === "invalid_note" ? message : "generic" };
  }
  revalidatePath(PATH, "page");
  return { status: "success", message: "pointsAdjusted" };
}

type RedeemData = { name: unknown; kind: string; value: number };

export async function redeemCustomerReward(
  slug: string,
  customerId: string,
  _prev: FormState<RedeemData>,
  formData: FormData,
): Promise<FormState<RedeemData>> {
  const context = await actionContext(slug, "marketing.write");
  if (!context) return { status: "error", error: "forbidden" };
  if (!z.uuid().safeParse(customerId).success) return { status: "error", error: "notFound" };
  const rewardId = formData.get("reward_id");
  if (typeof rewardId !== "string" || !z.uuid().safeParse(rewardId).success) return { status: "error", error: "invalid" };

  try {
    const reward = await loyaltyService.redeemLoyaltyReward(context, { customerId, rewardId });
    revalidatePath(PATH, "page");
    return { status: "success", message: "redeemed", data: reward };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return {
      status: "error",
      error: ["insufficient_points", "invalid_reward"].includes(message) ? message : "generic",
    };
  }
}
