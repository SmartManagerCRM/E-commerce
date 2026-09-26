import { z } from "zod";

import { toMinorUnits } from "@/lib/money";

import { localizedInput, optionalText, requiredLocalized } from "./common";

/**
 * Catalog input validation. Prices arrive as major-unit strings typed by
 * staff ("12.50") and are converted to integer minor units with the tenant's
 * currency exponent — never through floating point.
 */

/** Upper bound for any amount: 10^12 minor units (safe as a JSON number). */
const MAX_MINOR = BigInt(10) ** BigInt(12);

export const PRODUCT_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
export const CATEGORY_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
export const SKU = /^[A-Za-z0-9._/-]{1,64}$/;

/**
 * URL slug from a name: accents are removed, anything else becomes "-".
 * Returns "" for text without Latin letters or digits (e.g. Arabic-only
 * names); callers then fall back to a generated slug.
 */
export function slugify(value: string, maxLength = 80): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export const moneyInput = (exponent: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      try {
        const minor = toMinorUnits(value.replace(",", "."), exponent);
        if (minor < BigInt(0) || minor >= MAX_MINOR) throw new Error("range");
        return minor;
      } catch {
        ctx.addIssue({ code: "custom", message: "invalidPrice" });
        return z.NEVER;
      }
    });

const optionalMoney = (exponent: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => v ?? "")
    .pipe(z.union([z.literal("").transform(() => null), moneyInput(exponent)]));

const optionalInt = (min: number, max: number) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.null(), z.undefined(), z.boolean()])
  .transform((v) => v === "on" || v === "true" || v === true);

const slugInput = (pattern: RegExp) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v ?? "")
    .refine((v) => v === "" || pattern.test(v), "invalidSlug");

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export const productDetailsSchema = z.object({
  name: requiredLocalized(160),
  subtitle: localizedInput(160),
  description: localizedInput(5000),
  slug: slugInput(PRODUCT_SLUG),
  status: z.enum(PRODUCT_STATUSES),
  featured: checkbox,
  category_ids: z
    .array(z.uuid())
    .max(20)
    .optional()
    .transform((v) => [...new Set(v ?? [])]),
});

export type ProductDetailsInput = z.infer<typeof productDetailsSchema>;

/** New product: details plus the price of its default variant. */
export const newProductSchema = (exponent: number) =>
  z.object({
    name: requiredLocalized(160),
    slug: slugInput(PRODUCT_SLUG),
    price: moneyInput(exponent),
  });

/**
 * Options and variants, sent by the editor as JSON. Value `key`s link a
 * variant to option values that may not exist in the database yet.
 */
export const productStructureSchema = (exponent: number) =>
  z
    .object({
      options: z
        .array(
          z.object({
            id: z.uuid().nullish(),
            name: requiredLocalized(60),
            values: z
              .array(z.object({ id: z.uuid().nullish(), key: z.string().min(1).max(64), label: requiredLocalized(60) }))
              .min(1)
              .max(30),
          }),
        )
        .max(3),
      variants: z
        .array(
          z.object({
            id: z.uuid().nullish(),
            keys: z.array(z.string().min(1).max(64)).max(3),
            price: moneyInput(exponent),
            compare_at: optionalMoney(exponent),
            sku: z
              .string()
              .trim()
              .optional()
              .transform((v) => v || null)
              .refine((v) => v === null || SKU.test(v), "invalidSku"),
            weight_g: optionalInt(0, 1_000_000),
            initial_stock: optionalInt(0, 1_000_000),
          }),
        )
        .min(1)
        .max(100),
    })
    .superRefine((value, ctx) => {
      const keys = new Set(value.options.flatMap((o) => o.values.map((v) => v.key)));
      if (keys.size !== value.options.reduce((n, o) => n + o.values.length, 0)) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "duplicateValue" });
      }
      if (value.options.length === 0 && value.variants.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["variants"], message: "invalid" });
      }
      const combos = new Set<string>();
      const skus = new Set<string>();
      value.variants.forEach((variant, i) => {
        if (variant.keys.length !== value.options.length || variant.keys.some((k) => !keys.has(k))) {
          ctx.addIssue({ code: "custom", path: ["variants", i, "keys"], message: "invalid" });
        }
        const combo = [...variant.keys].sort().join("|");
        if (combos.has(combo)) ctx.addIssue({ code: "custom", path: ["variants", i], message: "duplicateVariant" });
        combos.add(combo);
        if (variant.compare_at !== null && variant.compare_at <= variant.price) {
          ctx.addIssue({ code: "custom", path: ["variants", i, "compare_at"], message: "compareAtTooLow" });
        }
        if (variant.sku) {
          const sku = variant.sku.toLowerCase();
          if (skus.has(sku)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "skuTaken" });
          skus.add(sku);
        }
      });
    });

export type ProductStructureInput = z.infer<ReturnType<typeof productStructureSchema>>;

/** JSON payload for `save_product_structure` (amounts as integer numbers). */
export function toStructurePayload(input: ProductStructureInput) {
  return {
    options: input.options.map((o) => ({
      id: o.id ?? null,
      name: o.name,
      values: o.values.map((v) => ({ id: v.id ?? null, key: v.key, label: v.label })),
    })),
    variants: input.variants.map((v) => ({
      id: v.id ?? null,
      keys: v.keys,
      price: Number(v.price),
      compare_at: v.compare_at === null ? null : Number(v.compare_at),
      sku: v.sku,
      weight_g: v.weight_g,
      initial_stock: v.id ? null : v.initial_stock,
    })),
  };
}

export const categorySchema = z.object({
  name: requiredLocalized(120),
  description: localizedInput(1000),
  slug: slugInput(CATEGORY_SLUG),
  parent_id: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => v || null),
  status: z.enum(["active", "hidden"]),
  position: optionalInt(0, 10_000).transform((v) => v ?? 0),
});

export const MANUAL_STOCK_REASONS = ["restock", "adjustment", "damage", "correction", "initial"] as const;

export const stockAdjustmentSchema = z.object({
  inventory_item_id: z.uuid(),
  direction: z.enum(["add", "remove"]),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.enum(MANUAL_STOCK_REASONS),
  note: optionalText(500),
});

export const inventorySettingsSchema = (exponent: number) =>
  z.object({
    inventory_item_id: z.uuid(),
    min_stock: z.coerce.number().int().min(0).max(1_000_000),
    track_stock: checkbox,
    allow_backorder: checkbox,
    cost: optionalMoney(exponent),
  });
