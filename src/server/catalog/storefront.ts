import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { Locale } from "@/i18n/locales";
import type { CatalogFilters } from "@/lib/catalog/filters";
import type { OptionView, VariantView } from "@/lib/catalog/variants";
import { pickLocalized } from "@/lib/localized";
import { publicMediaUrl } from "@/lib/storage";
import type { CategoryView, ImageView, PriceView, ProductCardView } from "@/lib/storefront/catalog-types";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import { anonymousClient } from "@/server/supabase/clients";

/**
 * Public catalog reads for the storefront. Everything goes through the
 * `storefront_*` database functions as the anonymous role, which only return
 * active products of active tenants and never cost or stock quantities.
 * Rows are validated here and mapped onto view models for components.
 */
const amount = z.union([z.number(), z.string()]).transform((v) => BigInt(v));
const availability = z.enum(["in_stock", "low_stock", "out_of_stock"]);
const imageRow = z.object({
  id: z.uuid().optional(),
  path: z.string(),
  width: z.number(),
  height: z.number(),
  alt: z.unknown(),
});

const cardRow = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.unknown(),
  subtitle: z.unknown(),
  featured: z.boolean(),
  price_min: amount,
  price_max: amount,
  compare_at: amount.nullable(),
  variant_count: z.number(),
  images: z.array(imageRow),
  availability,
});

const catalogResult = z.object({ total: z.number(), items: z.array(cardRow) });

const categoryRow = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.unknown(),
  description: z.unknown(),
  image_path: z.string().nullable(),
  parent_id: z.uuid().nullable(),
  product_count: z.number(),
});

const productRow = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.unknown(),
  subtitle: z.unknown(),
  description: z.unknown(),
  images: z.array(imageRow),
  options: z.array(
    z.object({ id: z.uuid(), name: z.unknown(), values: z.array(z.object({ id: z.uuid(), label: z.unknown() })) }),
  ),
  variants: z.array(
    z.object({
      id: z.uuid(),
      sku: z.string().nullable(),
      option_value_ids: z.array(z.uuid()),
      price: amount,
      compare_at: amount.nullable(),
      image_id: z.uuid().nullable(),
      availability,
    }),
  ),
  categories: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.unknown(), parent_id: z.uuid().nullable() })),
  updated_at: z.string(),
});

type Ctx = { tenant: ActiveStorefrontTenant; locale: Locale };

const text = (ctx: Ctx, value: unknown) => pickLocalized(value, ctx.locale, ctx.tenant.default_language);

function image(ctx: Ctx, row: z.infer<typeof imageRow> | undefined, fallbackAlt: string): ImageView | null {
  const src = publicMediaUrl(row?.path);
  if (!row || !src) return null;
  return { src, alt: text(ctx, row.alt) || fallbackAlt, width: row.width, height: row.height };
}

function price(ctx: Ctx, amountMinor: bigint, compareAtMinor: bigint | null, from = false): PriceView {
  return {
    amountMinor,
    compareAtMinor,
    currency: ctx.tenant.currency,
    exponent: ctx.tenant.currency_exponent,
    from,
  };
}

function toCard(ctx: Ctx, row: z.infer<typeof cardRow>): ProductCardView {
  const name = text(ctx, row.name);
  const onSale = row.compare_at !== null && row.compare_at > row.price_min;
  return {
    id: row.id,
    href: `/products/${row.slug}`,
    name,
    subtitle: text(ctx, row.subtitle) || undefined,
    image: image(ctx, row.images[0], name),
    hoverImage: image(ctx, row.images[1], name),
    price: price(ctx, row.price_min, row.compare_at, row.price_max > row.price_min),
    badges: onSale ? ["sale"] : [],
    availability: row.availability,
  };
}

export type CatalogQuery = Partial<CatalogFilters> & {
  category?: string | null;
  featured?: boolean;
  limit?: number;
  exclude?: string | null;
};

export async function getCatalog(ctx: Ctx, query: CatalogQuery): Promise<{ total: number; items: ProductCardView[] }> {
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 60);
  const { data, error } = await anonymousClient().rpc("storefront_catalog", {
    p_tenant: ctx.tenant.id,
    p_locale: ctx.locale,
    p_query: query.q ?? undefined,
    p_category: query.category ?? undefined,
    p_min_price: query.minMinor != null ? Number(query.minMinor) : undefined,
    p_max_price: query.maxMinor != null ? Number(query.maxMinor) : undefined,
    p_available: query.available ?? false,
    p_featured: query.featured ?? false,
    p_sort: query.sort ?? "featured",
    p_limit: limit,
    p_offset: ((query.page ?? 1) - 1) * limit,
    p_exclude: query.exclude ?? undefined,
  });
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);
  const parsed = catalogResult.parse(data);
  return { total: parsed.total, items: parsed.items.map((row) => toCard(ctx, row)) };
}

export const getCategories = cache(async (tenant: ActiveStorefrontTenant, locale: Locale): Promise<CategoryView[]> => {
  const { data, error } = await anonymousClient().rpc("storefront_categories", { p_tenant: tenant.id });
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  const ctx = { tenant, locale };
  return z
    .array(categoryRow)
    .parse(data)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: text(ctx, row.name),
      description: text(ctx, row.description),
      imagePath: row.image_path,
      parentId: row.parent_id,
      productCount: row.product_count,
    }));
});

/** Whether the store has anything to sell (drives the header "Shop" link). */
export const hasProducts = cache(async (tenant: ActiveStorefrontTenant): Promise<boolean> => {
  const { data, error } = await anonymousClient().rpc("storefront_catalog", { p_tenant: tenant.id, p_limit: 1 });
  if (error) return false;
  return catalogResult.safeParse(data).data?.total !== 0;
});

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  images: (ImageView & { id: string })[];
  options: OptionView[];
  variants: (VariantView & { sku: string | null })[];
  categories: { id: string; slug: string; name: string }[];
  priceRange: PriceView;
  updatedAt: string;
};

export const getProduct = cache(
  async (tenant: ActiveStorefrontTenant, locale: Locale, slug: string): Promise<ProductDetail | null> => {
    const { data, error } = await anonymousClient().rpc("storefront_product", { p_tenant: tenant.id, p_slug: slug });
    if (error) throw new Error(`Failed to load product: ${error.message}`);
    if (!data) return null;
    const row = productRow.parse(data);
    if (row.variants.length === 0) return null;
    const ctx = { tenant, locale };
    const name = text(ctx, row.name);
    const prices = row.variants.map((v) => v.price);
    const min = prices.reduce((a, b) => (b < a ? b : a));
    const max = prices.reduce((a, b) => (b > a ? b : a));
    return {
      id: row.id,
      slug: row.slug,
      name,
      subtitle: text(ctx, row.subtitle),
      description: text(ctx, row.description),
      images: row.images.flatMap((i) => {
        const view = image(ctx, i, name);
        return view && i.id ? [{ ...view, id: i.id }] : [];
      }),
      options: row.options.map((o) => ({
        id: o.id,
        name: text(ctx, o.name),
        values: o.values.map((v) => ({ id: v.id, label: text(ctx, v.label) })),
      })),
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        optionValueIds: v.option_value_ids,
        priceMinor: v.price.toString(),
        compareAtMinor: v.compare_at?.toString() ?? null,
        availability: v.availability,
        imageId: v.image_id,
      })),
      categories: row.categories.map((c) => ({ id: c.id, slug: c.slug, name: text(ctx, c.name) })),
      priceRange: price(ctx, min, null, max > min),
      updatedAt: row.updated_at,
    };
  },
);
