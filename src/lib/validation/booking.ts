import { z } from "zod";

import { emailSchema, optionalText, requiredLocalized } from "./common";

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,24}$/, "invalidPhone");

/** Storefront booking request. The browser only sends what it wants and who to contact — never a price. */
export const bookingRequestSchema = z.object({
  resource_id: z.uuid(),
  start: z.iso.datetime({ offset: true }),
  guests: z.coerce.number().int().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  phone: z
    .union([z.literal(""), phone])
    .optional()
    .transform((v) => v || null),
  notes: optionalText(500),
  // Honeypot: real customers never fill this hidden field.
  company: z.string().max(0).optional(),
});
export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

/** Booking & resource settings edited in the console. */
export const bookingSettingsSchema = z.object({
  accepting_bookings: z.boolean(),
  default_duration_minutes: z.coerce.number().int().min(15).max(480),
  buffer_minutes: z.coerce.number().int().min(0).max(120),
  min_notice_minutes: z.coerce.number().int().min(0).max(10080),
  max_advance_days: z.coerce.number().int().min(1).max(365),
  max_party_size: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export const bookingResourceSchema = z.object({
  id: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => v || null),
  name: requiredLocalized(60),
  kind: z.enum(["table", "area", "staff", "room"]),
  capacity_min: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  capacity_max: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  active: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
  position: z.coerce.number().int().min(0).max(1000).optional().default(0),
});
