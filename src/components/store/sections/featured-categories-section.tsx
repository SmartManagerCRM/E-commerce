import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import type { SectionProps } from "@/lib/storefront/sections";
import { getCategories } from "@/server/catalog/storefront";

import { MediaImage } from "../media-image";
import { SectionHeading } from "../section-heading";
import { text, type SectionContext } from "./types";

/** Top-level categories that have products, as image tiles. */
export async function FeaturedCategoriesSection({
  props,
  ctx,
}: {
  props: SectionProps<"featured_categories">;
  ctx: SectionContext;
}) {
  const t = await getTranslations("store.sections");
  const categories = (await getCategories(ctx.tenant, ctx.locale))
    .filter((c) => c.parentId === null && c.productCount > 0)
    .slice(0, 8);
  if (categories.length === 0) return null;
  return (
    <section id={ctx.anchor} aria-labelledby="featured-categories-title" className="scroll-mt-24">
      <Container className="py-16 sm:py-24">
        <SectionHeading id="featured-categories-title" title={text(ctx, props.title) || t("featuredCategoriesTitle")} />
        <ul className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/shop/${category.slug}`}
                className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <MediaImage
                  path={category.imagePath}
                  alt=""
                  aspect="aspect-[4/3]"
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="rounded-lg transition-transform duration-500 ease-standard group-hover:scale-[1.02]"
                />
                <p className="mt-3 font-medium">{category.name}</p>
                <p className="text-sm text-muted">{t("productCount", { count: category.productCount })}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
