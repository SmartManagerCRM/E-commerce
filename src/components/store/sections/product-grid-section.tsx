import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import type { ProductCardView } from "@/lib/storefront/catalog-types";

import { ProductCard, ProductGrid } from "../product-card";
import { SectionHeading } from "../section-heading";
import type { SectionContext } from "./types";

/** Heading + product grid + "View all" link, shared by the catalog sections. */
export async function ProductGridSection({
  id,
  title,
  products,
  viewAllHref,
  ctx,
}: {
  id: string;
  title: string;
  products: ProductCardView[];
  viewAllHref: string;
  ctx: SectionContext;
}) {
  const t = await getTranslations("store.sections");
  return (
    <section id={ctx.anchor} aria-labelledby={id} className="scroll-mt-24">
      <Container className="py-16 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading id={id} title={title} />
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
          >
            {t("viewAll")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10">
          <ProductGrid>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} style={ctx.design.card} />
            ))}
          </ProductGrid>
        </div>
      </Container>
    </section>
  );
}
