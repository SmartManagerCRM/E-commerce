import { z } from "zod";

import { LOCALES } from "@/i18n/locales";
import { THEMES } from "@/themes/definitions";

import { emailSchema, hexColor, localeSchema, optionalText, slugSchema } from "./common";

const localizedInput = (max: number) =>
  z
    .object(Object.fromEntries(LOCALES.map((l) => [l, z.string().trim().max(max).optional()])))
    .transform((value) =>
      Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    );

const BUSINESS_TYPES = ["cafe", "restaurant", "retail", "food", "beauty", "salon", "spa", "gym", "other"] as const;
export const businessTypeSchema = z.enum(BUSINESS_TYPES);
export { BUSINESS_TYPES };

export const timezoneSchema = z
  .string()
  .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "invalid");

const languagesShape = {
  default_language: localeSchema,
  enabled_languages: z.array(localeSchema).min(1),
};

function defaultEnabled(v: { default_language: string; enabled_languages: string[] }) {
  return v.enabled_languages.includes(v.default_language);
}

/** Business profile edited by tenant owners/admins (never slug, status or currency). */
export const businessProfileSchema = z
  .object({
    business_name: z.string().trim().min(1).max(120),
    tagline: localizedInput(160),
    description: localizedInput(1000),
    phone: optionalText(32),
    email: z
      .union([z.literal(""), emailSchema])
      .optional()
      .transform((v) => v || null),
    address_line1: optionalText(200),
    address_line2: optionalText(200),
    city: optionalText(100),
    postal_code: optionalText(20),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/)
      .transform((v) => v || null),
    timezone: timezoneSchema,
    ...languagesShape,
  })
  .refine(defaultEnabled, { path: ["default_language"], message: "invalid" });

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

const themeKeys = Object.keys(THEMES) as [keyof typeof THEMES, ...(keyof typeof THEMES)[]];

export const appearanceSchema = z.object({
  theme_key: z.enum(themeKeys),
  primary: z.union([z.literal(""), hexColor]).transform((v) => v || null),
  accent: z.union([z.literal(""), hexColor]).transform((v) => v || null),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role_key: z.enum(["tenant_owner", "admin", "manager", "staff"]),
});

/** Custom domain entered by a tenant: normalized, must be a registrable hostname. */
export const customDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) =>
    v
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\.$/, ""),
  )
  .pipe(z.string().regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/));

export const createTenantSchema = z
  .object({
    business_name: z.string().trim().min(1).max(120),
    slug: slugSchema,
    business_type: businessTypeSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    timezone: timezoneSchema,
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/),
    city: z.string().trim().max(100),
    plan_key: z.string().min(1),
    owner_email: emailSchema,
    ...languagesShape,
  })
  .refine(defaultEnabled, { path: ["default_language"], message: "invalid" });
