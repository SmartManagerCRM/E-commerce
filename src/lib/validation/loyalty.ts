import { z } from "zod";

import { moneyInput } from "./catalog";
import { requiredLocalized } from "./common";

/** Loyalty program settings edited in the console. */
export const loyaltySettingsSchema = z.object({
  active: z.boolean(),
  points_per_currency_unit: z.coerce.number().min(0).max(1000),
});

export const loyaltyTierSchema = z.object({
  id: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => v || null),
  name: requiredLocalized(60),
  threshold_points: z.coerce.number().int().min(0).max(1_000_000),
  perks: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  active: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
  position: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

/** `value` means minor units of the tenant's currency for `discount_fixed`, or a 1–100 percent for `discount_percent`. */
export const loyaltyRewardSchema = (exponent: number) =>
  z
    .object({
      id: z
        .union([z.literal(""), z.uuid()])
        .optional()
        .transform((v) => v || null),
      name: requiredLocalized(60),
      cost_points: z.coerce.number().int().min(1).max(1_000_000),
      kind: z.enum(["discount_percent", "discount_fixed"]),
      value: z.string().trim(),
      active: z
        .literal("on")
        .optional()
        .transform((v) => v === "on"),
      position: z.coerce.number().int().min(0).max(1000).optional().default(0),
    })
    .transform((input, ctx) => {
      if (input.kind === "discount_percent") {
        const percent = Number(input.value);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          ctx.addIssue({ code: "custom", path: ["value"], message: "invalid" });
          return z.NEVER;
        }
        return { ...input, value: percent };
      }
      const parsed = moneyInput(exponent).safeParse(input.value);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "invalidPrice" });
        return z.NEVER;
      }
      return { ...input, value: Number(parsed.data) };
    });

export const loyaltyAdjustSchema = z.object({
  delta: z.coerce.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, "required"),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});
