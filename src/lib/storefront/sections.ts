import { z } from "zod";

import { LOCALES } from "@/i18n/locales";
import { asLocalizedText, type LocalizedText } from "@/lib/localized";

/**
 * Homepage section model. Sections are stored as a JSON array in
 * `storefront_configs.homepage_sections` and validated here on every read and
 * write, so a malformed entry can never break a storefront.
 *
 * Availability: sections backed by modules that do not exist yet are listed
 * in the registry but cannot be enabled until that module ships — the
 * storefront never shows a section that cannot actually work.
 */
export const localizedSchema = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((v) => asLocalizedText(v));

const MAX_HREF = 500;
/** Internal path (`/…`), in-page anchor (`#…`), `https://`, `tel:` or `mailto:` links only. */
export const hrefSchema = z
  .string()
  .trim()
  .max(MAX_HREF)
  .refine((v) => /^(\/(?![/\\])|#[\w-]+$|https:\/\/|tel:\+?[\d\s-]+$|mailto:[^\s@]+@[^\s@]+$)/.test(v), "invalid");

const imagePathSchema = z
  .string()
  .regex(/^[0-9a-f-]{36}\/sections\/[\w-]+\.(webp|jpg|png)$/)
  .nullable()
  .catch(null);

const ctaSchema = z.object({ label: localizedSchema, href: hrefSchema }).nullable().catch(null);

export const heroPropsSchema = z.object({
  variant: z.enum(["split", "centered", "image"]).catch("split"),
  eyebrow: localizedSchema,
  title: localizedSchema,
  subtitle: localizedSchema,
  image_path: imagePathSchema,
  cta: ctaSchema,
});

export const promoBannerPropsSchema = z.object({
  text: localizedSchema,
  cta: ctaSchema,
  tone: z.enum(["primary", "accent", "dark"]).catch("primary"),
});

export const brandStoryPropsSchema = z.object({
  variant: z.enum(["image_start", "image_end"]).catch("image_start"),
  eyebrow: localizedSchema,
  title: localizedSchema,
  body: localizedSchema,
  image_path: imagePathSchema,
});

export const testimonialsPropsSchema = z.object({
  title: localizedSchema,
  items: z
    .array(z.object({ quote: localizedSchema, author: z.string().trim().max(80), detail: localizedSchema }))
    .max(6)
    .catch([]),
});

export const locationPropsSchema = z.object({
  title: localizedSchema,
  show_hours: z.boolean().catch(true),
  show_map: z.boolean().catch(true),
});

export const newsletterPropsSchema = z.object({
  title: localizedSchema,
  subtitle: localizedSchema,
});

const productLimit = z.union([z.literal(4), z.literal(8), z.literal(12)]).catch(8);

export const featuredProductsPropsSchema = z.object({
  title: localizedSchema,
  limit: productLimit,
});

export const featuredCategoriesPropsSchema = z.object({
  title: localizedSchema,
});

export const productCollectionPropsSchema = z.object({
  title: localizedSchema,
  category: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/)
    .nullable()
    .catch(null),
  limit: productLimit,
});

const emptyProps = z.object({}).catch({});

export const SECTION_SCHEMAS = {
  hero: heroPropsSchema,
  promo_banner: promoBannerPropsSchema,
  brand_story: brandStoryPropsSchema,
  testimonials: testimonialsPropsSchema,
  location: locationPropsSchema,
  newsletter: newsletterPropsSchema,
  featured_categories: featuredCategoriesPropsSchema,
  featured_products: featuredProductsPropsSchema,
  best_sellers: featuredProductsPropsSchema,
  product_collection: productCollectionPropsSchema,
  loyalty: emptyProps,
  booking_cta: emptyProps,
} as const;

export type SectionType = keyof typeof SECTION_SCHEMAS;
export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS) as SectionType[];

export type SectionProps<T extends SectionType> = z.infer<(typeof SECTION_SCHEMAS)[T]>;

export type Section<T extends SectionType = SectionType> = {
  [K in T]: { id: string; type: K; enabled: boolean; props: SectionProps<K> };
}[T];

type Availability = { available: true } | { available: false; reason: "booking" | "loyalty" };

/** Which sections can be used today. Unavailable ones become usable in their phase. */
export const SECTION_REGISTRY: Record<SectionType, Availability & { multiple: boolean }> = {
  hero: { available: true, multiple: false },
  promo_banner: { available: true, multiple: true },
  brand_story: { available: true, multiple: true },
  testimonials: { available: true, multiple: false },
  location: { available: true, multiple: false },
  newsletter: { available: true, multiple: false },
  featured_categories: { available: true, multiple: false },
  featured_products: { available: true, multiple: false },
  // Ranked from real orders (last 90 days); hidden until there are sales.
  best_sellers: { available: true, multiple: false },
  product_collection: { available: true, multiple: true },
  loyalty: { available: false, reason: "loyalty", multiple: false },
  booking_cta: { available: false, reason: "booking", multiple: false },
};

export const MAX_SECTIONS = 20;

const rawSectionSchema = z.object({
  id: z.uuid(),
  type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]),
  enabled: z.boolean().catch(false),
  props: z.unknown(),
});

/** Validates stored sections; drops anything malformed or not yet available. */
export function parseSections(value: unknown): Section[] {
  if (!Array.isArray(value)) return [];
  const result: Section[] = [];
  for (const entry of value.slice(0, MAX_SECTIONS)) {
    const raw = rawSectionSchema.safeParse(entry);
    if (!raw.success || !SECTION_REGISTRY[raw.data.type].available) continue;
    const props = SECTION_SCHEMAS[raw.data.type].safeParse(raw.data.props ?? {});
    if (!props.success) continue;
    result.push({ id: raw.data.id, type: raw.data.type, enabled: raw.data.enabled, props: props.data } as Section);
  }
  return result;
}

export function emptySectionProps(type: SectionType): SectionProps<SectionType> {
  return SECTION_SCHEMAS[type].parse({});
}

type TenantBasics = {
  business_name: string;
  tagline: LocalizedText;
  description: LocalizedText;
  hasAddress: boolean;
};

const fill = (value: string): LocalizedText => Object.fromEntries(LOCALES.map((l) => [l, value]));

/**
 * Sensible homepage for a tenant that has not customised one yet, built only
 * from its real profile data (nothing invented).
 */
export function defaultSections(tenant: TenantBasics, newId: () => string): Section[] {
  const sections: Section[] = [
    {
      id: newId(),
      type: "hero",
      enabled: true,
      props: {
        variant: "split",
        eyebrow: tenant.tagline,
        title: fill(tenant.business_name),
        subtitle: tenant.description,
        image_path: null,
        cta: null,
      },
    },
  ];
  if (Object.keys(tenant.description).length > 0) {
    sections.push({
      id: newId(),
      type: "brand_story",
      enabled: false,
      props: { variant: "image_start", eyebrow: {}, title: {}, body: tenant.description, image_path: null },
    });
  }
  if (tenant.hasAddress) {
    sections.push({
      id: newId(),
      type: "location",
      enabled: true,
      props: { title: {}, show_hours: true, show_map: true },
    });
  }
  sections.push({ id: newId(), type: "newsletter", enabled: false, props: { title: {}, subtitle: {} } });
  return sections;
}
