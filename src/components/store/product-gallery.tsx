"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { ImageView } from "@/lib/storefront/catalog-types";

/**
 * Large product gallery: main image + thumbnail strip on desktop, swipeable
 * scroll-snap strip on mobile. Thumbnails are buttons with pressed state.
 */
export function ProductGallery({
  images,
  productName,
  focusIndex,
}: {
  images: ImageView[];
  productName: string;
  /** Image to show when it changes (e.g. the selected variant's image). */
  focusIndex?: number;
}) {
  const t = useTranslations("catalog");
  const [active, setActive] = useState(focusIndex ?? 0);
  const [lastFocus, setLastFocus] = useState(focusIndex);
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the variant image without an effect: adjust state during render.
  if (focusIndex !== lastFocus) {
    setLastFocus(focusIndex);
    if (focusIndex !== undefined) setActive(focusIndex);
  }

  if (images.length === 0) {
    return <div className="aspect-square w-full rounded-lg bg-fg/[0.04]" aria-hidden="true" />;
  }

  const select = (index: number) => {
    setActive(index);
    const el = scroller.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div
        ref={scroller}
        className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] lg:block lg:overflow-visible"
        aria-label={t("galleryLabel", { name: productName })}
      >
        {images.map((image, index) => (
          <div
            key={image.src}
            className={cn(
              "relative aspect-square w-[88%] shrink-0 snap-center overflow-hidden rounded-lg bg-fg/[0.04] sm:w-full",
              "lg:w-full",
              index !== active && "lg:hidden",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt || productName}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 50vw, 90vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {images.length > 1 ? (
        <div className="hidden gap-3 lg:flex lg:w-20 lg:flex-col" role="group" aria-label={t("thumbnails")}>
          {images.map((image, index) => (
            <button
              key={image.src}
              type="button"
              onClick={() => select(index)}
              aria-pressed={index === active}
              aria-label={t("showImage", { index: index + 1, total: images.length })}
              className={cn(
                "relative aspect-square w-full overflow-hidden rounded-md border-2 transition-colors",
                index === active ? "border-fg" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={image.src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
