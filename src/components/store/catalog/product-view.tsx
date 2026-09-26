"use client";

import { Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  chooseValue,
  defaultVariant,
  findVariant,
  selectionOf,
  valueStates,
  type OptionView,
  type VariantView,
} from "@/lib/catalog/variants";
import type { ImageView, PriceView } from "@/lib/storefront/catalog-types";

import { Price } from "../price";
import { AddToCart, type AddToCartAction } from "./add-to-cart";
import { ProductGallery } from "../product-gallery";
import { VariantSelector } from "../variant-selector";

type ProductViewProps = {
  name: string;
  subtitle: string;
  images: (ImageView & { id: string })[];
  options: OptionView[];
  variants: (VariantView & { sku: string | null })[];
  currency: string;
  exponent: number;
  contact: { business: string; phone: string | null; email: string | null };
  /** Present when the store takes online orders; otherwise a "contact us to order" panel is shown. */
  ordering: { addToCart: AddToCartAction } | null;
};

/**
 * Product page gallery + purchase panel. Choosing options updates the price,
 * availability, SKU and image of the matching variant. When the store takes
 * online orders the panel adds to the cart; otherwise it says so honestly and
 * offers the store's contact details instead of a button that does nothing.
 */
export function ProductView({
  name,
  subtitle,
  images,
  options,
  variants,
  currency,
  exponent,
  contact,
  ordering,
}: ProductViewProps) {
  const t = useTranslations("catalog");
  const tp = useTranslations("store.product");
  const [selection, setSelection] = useState(() => {
    const first = defaultVariant(variants);
    return first ? selectionOf(first, options) : {};
  });
  const variant = findVariant(variants, selection);
  const states = useMemo(() => valueStates(options, variants, selection), [options, variants, selection]);

  const price: PriceView | null = variant
    ? {
        amountMinor: BigInt(variant.priceMinor),
        compareAtMinor: variant.compareAtMinor ? BigInt(variant.compareAtMinor) : null,
        currency,
        exponent,
      }
    : null;
  const imageIndex = variant?.imageId ? images.findIndex((i) => i.id === variant.imageId) : -1;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
      <ProductGallery images={images} productName={name} focusIndex={imageIndex >= 0 ? imageIndex : undefined} />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-display-md font-semibold text-balance rtl:leading-snug">{name}</h1>
          {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
        </div>

        <div aria-live="polite" className="space-y-2">
          {price ? <Price price={price} size="lg" /> : <p className="text-muted">{tp("unavailableCombination")}</p>}
          {variant ? (
            <p
              className={
                variant.availability === "out_of_stock"
                  ? "text-sm font-medium text-danger"
                  : variant.availability === "low_stock"
                    ? "text-sm font-medium text-warning"
                    : "text-sm text-success"
              }
            >
              {variant.availability === "out_of_stock"
                ? t("soldOut")
                : variant.availability === "low_stock"
                  ? t("lowStock")
                  : tp("available")}
            </p>
          ) : null}
          {variant?.sku ? (
            <p className="text-xs text-muted">
              {tp("sku")} <span dir="ltr">{variant.sku}</span>
            </p>
          ) : null}
        </div>

        {options.map((option) => (
          <VariantSelector
            key={option.id}
            legend={option.name}
            name={`option-${option.id}`}
            value={selection[option.id] ?? ""}
            onChange={(valueId) => setSelection(chooseValue(options, variants, selection, option.id, valueId))}
            unavailableLabel={t("soldOut")}
            options={option.values.map((value) => ({
              id: value.id,
              label: value.label,
              available: states[value.id]?.available ?? false,
              disabled: !variants.some((v) => v.optionValueIds.includes(value.id)),
            }))}
          />
        ))}

        {ordering ? (
          <AddToCart
            action={ordering.addToCart}
            variantId={variant?.id ?? null}
            soldOut={variant?.availability === "out_of_stock"}
          />
        ) : (
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="font-medium">{tp("orderingSoonTitle")}</p>
            <p className="mt-1 text-sm text-muted">
              {contact.phone || contact.email
                ? tp("orderingSoonContact", { business: contact.business })
                : tp("orderingSoonBody")}
            </p>
            {contact.phone || contact.email ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                    className="inline-flex h-11 items-center gap-2 rounded-button bg-primary px-5 text-sm font-medium text-primary-fg hover:opacity-90"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    <span dir="ltr">{contact.phone}</span>
                  </a>
                ) : null}
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}?subject=${encodeURIComponent(name)}`}
                    className="inline-flex h-11 items-center gap-2 rounded-button border border-border px-5 text-sm font-medium hover:bg-bg"
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {tp("emailUs")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
