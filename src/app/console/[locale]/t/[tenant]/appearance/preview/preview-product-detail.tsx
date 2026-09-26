"use client";

import { Truck, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Price } from "@/components/store/price";
import { ProductGallery } from "@/components/store/product-gallery";
import { QuantityStepper } from "@/components/store/quantity-stepper";
import { Rating } from "@/components/store/rating";
import { VariantSelector } from "@/components/store/variant-selector";
import { Button } from "@/components/ui/button";
import type { ImageView, PriceView, VariantOption } from "@/lib/storefront/catalog-types";

type Props = {
  name: string;
  description: string;
  images: ImageView[];
  variants: (VariantOption & { price: PriceView })[];
};

/** Product-page layout with sample data (buttons are inactive in the preview). */
export function PreviewProductDetail({ name, description, images, variants }: Props) {
  const t = useTranslations("catalog");
  const [variantId, setVariantId] = useState(variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <ProductGallery images={images} productName={name} />
      <div className="lg:py-4">
        <h3 className="font-display text-display-md font-semibold rtl:leading-snug">{name}</h3>
        <Rating value={4.9} count={128} className="mt-3" />
        <Price price={variant.price} size="lg" className="mt-5" />
        <p className="mt-5 leading-relaxed text-muted">{description}</p>
        <div className="mt-8 space-y-6">
          <VariantSelector
            legend={t("size")}
            name="preview-variant"
            options={variants}
            value={variantId}
            onChange={setVariantId}
            unavailableLabel={t("soldOut")}
          />
          <div>
            <p className="mb-2 text-sm font-medium">{t("quantity")}</p>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="flex-1" type="button" aria-disabled="true">
              {t("addToCart")}
            </Button>
            <Button size="lg" variant="secondary" className="flex-1" type="button" aria-disabled="true">
              {t("buyNow")}
            </Button>
          </div>
          <p className="text-sm text-success">{t("inStock")}</p>
          <ul className="space-y-3 border-t border-border pt-6 text-sm">
            <li className="flex gap-3">
              <Truck className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
              {t("deliveryInfo")}
            </li>
            <li className="flex gap-3">
              <Store className="size-5 shrink-0 text-accent-text rtl:-scale-x-100" aria-hidden="true" />
              {t("pickupInfo")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
