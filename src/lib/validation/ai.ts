import { z } from "zod";

export const AI_TONES = ["professional", "friendly", "premium", "casual", "minimal"] as const;

/** AI assistant settings edited in the console. */
export const aiSettingsSchema = z.object({
  active: z.boolean(),
  assistant_name: z.string().trim().min(1).max(40),
  greeting: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
  tone: z.enum(AI_TONES),
});
