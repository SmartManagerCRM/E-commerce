import { z } from "zod";

import { emailSchema, optionalText } from "./common";

/**
 * Checkout form. Only contact, fulfillment choice and address are accepted
 * from the browser — never prices, totals, tax or stock.
 */
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,24}$/, "invalidPhone");

export const checkoutSchema = z
  .object({
    fulfillment: z.enum(["pickup", "delivery"]),
    payment_method: z.enum(["pay_on_fulfillment", "online"]).default("pay_on_fulfillment"),
    zone_id: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    phone: z
      .union([z.literal(""), phone])
      .optional()
      .transform((v) => v || null),
    address_line1: optionalText(200),
    address_line2: optionalText(200),
    address_city: optionalText(100),
    address_notes: optionalText(300),
    notes: optionalText(1000),
    marketing_consent: z
      .union([z.literal("on"), z.literal("")])
      .optional()
      .transform((v) => v === "on"),
    // Honeypot: real customers never fill this hidden field.
    company: z.string().max(0).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment !== "delivery") return;
    if (!v.zone_id) ctx.addIssue({ code: "custom", path: ["zone_id"], message: "required" });
    if (!v.address_line1) ctx.addIssue({ code: "custom", path: ["address_line1"], message: "required" });
    if (!v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "required" });
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Payload for `create_order_from_cart` (the database validates it again). */
export function toOrderPayload(input: CheckoutInput, locale: string, accessTokenHash: string) {
  return {
    fulfillment: input.fulfillment,
    payment_method: input.payment_method,
    zone_id: input.fulfillment === "delivery" ? input.zone_id : null,
    contact: { name: input.name, email: input.email, phone: input.phone },
    address:
      input.fulfillment === "delivery"
        ? {
            line1: input.address_line1,
            line2: input.address_line2,
            city: input.address_city,
            notes: input.address_notes,
          }
        : null,
    notes: input.notes,
    locale,
    marketing_consent: input.marketing_consent,
    access_token_hash: accessTokenHash,
  };
}

/** Checkout & delivery settings edited in the console. */
export const commerceSettingsSchema = (toMinor: (v: string) => bigint | null) =>
  z.object({
    accepting_orders: z.boolean(),
    pickup: z.boolean(),
    delivery: z.boolean(),
    pay_on_fulfillment: z.boolean(),
    min_order: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        const minor = toMinor(v);
        if (minor === null) {
          ctx.addIssue({ code: "custom", message: "invalidPrice" });
          return z.NEVER;
        }
        return minor;
      }),
    tax_rate: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "invalidRate")
      .transform((v) => Math.round(Number(v) * 100))
      .refine((bps) => bps >= 0 && bps <= 10000, "invalidRate"),
    tax_included: z.boolean(),
    tax_registration_number: z
      .string()
      .trim()
      .max(30)
      .transform((v) => v || null),
  });
