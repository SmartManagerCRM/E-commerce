/**
 * View models consumed by storefront catalog components. The catalog
 * services (Phase 4) map database rows onto these; components never see raw
 * rows, cost or stock quantities.
 */
export type PriceView = {
  amountMinor: bigint;
  compareAtMinor: bigint | null;
  currency: string;
  exponent: number;
  /** Variants have different prices: shown as "From …". */
  from?: boolean;
};

export type ImageView = { src: string; alt: string; width?: number; height?: number };

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export type ProductCardView = {
  id: string;
  href: string;
  name: string;
  subtitle?: string;
  image: ImageView | null;
  hoverImage?: ImageView | null;
  price: PriceView;
  /** e.g. "3 sizes" — shown when the product has variants. */
  optionsLabel?: string;
  rating?: { value: number; count: number };
  badges?: ("new" | "sale" | "bestseller")[];
  availability: Availability;
};

export type VariantOption = {
  id: string;
  label: string;
  /** Purchasable with the other current choices (otherwise shown struck through). */
  available: boolean;
  /** Cannot be chosen at all; defaults to `!available`. */
  disabled?: boolean;
};

export type CategoryView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imagePath: string | null;
  parentId: string | null;
  productCount: number;
};
