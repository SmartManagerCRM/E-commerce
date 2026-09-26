import { z } from "zod";

import { LOCALES } from "@/i18n/locales";

export const localeSchema = z.enum(LOCALES);

/** Trimmed optional text: empty strings become null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Localized text from `<field>.<locale>` inputs; empty translations are dropped. */
export const localizedInput = (max: number) =>
  z
    .preprocess(
      (v) => v ?? {},
      z.object(Object.fromEntries(LOCALES.map((l) => [l, z.string().trim().max(max).optional()]))),
    )
    .transform((value) =>
      Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    );

/** Same, but at least one language must be filled in. */
export const requiredLocalized = (max: number) =>
  localizedInput(max).refine((value) => Object.keys(value).length > 0, "required");

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/);

/**
 * Result shape shared by every form Server Action. `error` / field errors are
 * translation keys so messages render in the user's language.
 */
export type FormState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; error: string; fieldErrors?: Record<string, string> };

export const idleState = { status: "idle" } as const;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !result[key]) result[key] = "invalid";
  }
  return result;
}
