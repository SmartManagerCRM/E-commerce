import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs, type Crumb } from "@/components/store/catalog/breadcrumbs";
import { ProductView } from "@/components/store/catalog/product-view";
import { ProductCard, ProductGrid } from "@/components/store/product-card";
import { SectionHeading } from "@/components/store/section-heading";
import { Container } from "@/components/ui/container";
import { minorToDecimal } from "@/lib/money";
import { breadcrumbJsonLd, jsonLdScript, productJsonLd } from "@/lib/storefront/structured-data";
import { getCatalog, getProduct } from "@/server/catalog/storefront";
import { storefrontDesign } from "@/server/storefront/homepage";
import { requireStorePage, storeAlternates } from "@/server/storefront/page-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

type Props = PageProps<"/store/[tenant]/[locale]/products/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, locale: rawLocale, slug } = await params;
  const { tenant, locale } = await requireStorePage(tenantSlug, rawLocale);
  const product = await getProduct(tenant, locale, slug);
  if (!product) return {};
  const description = (product.subtitle || product.description).slice(0, 160) || undefined;
  const image = product.images[0];
  return {
    title: product.name,
    description,
    alternates: storeAlternates(tenant, locale, `/products/${product.slug}`),
    openGraph: {
      title: product.name,
      description,
      images: image ? [{ url: image.src, width: image.width, height: image.height, alt: image.alt }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { tenant: tenantSlug, locale: rawLocale, slug } = await params;
  const { tenant, locale } = await requireStorePage(tenantSlug, rawLocale);
  const product = await getProduct(tenant, locale, slug);
  if (!product) notFound();

  const t = await getTranslations("store");
  const origin = storefrontOrigin(tenant);
  const design = storefrontDesign(tenant);
  const category = product.categories[0] ?? null;
  const related = await getCatalog(
    { tenant, locale },
    { category: category?.slug ?? null, exclude: product.id, limit: 4, sort: "featured" },
  );

  const crumbs: Crumb[] = [
    { label: t("nav.home"), href: "/" },
    { label: t("shop.title"), href: "/shop" },
    ...(category ? [{ label: category.name, href: `/shop/${category.slug}` }] : []),
    { label: product.name },
  ];
  const url = `${origin}/${locale}/products/${product.slug}`;
  const structured = [
    productJsonLd({
      url,
      name: product.name,
      description: product.description,
      images: product.images.map((i) => i.src),
      sku: product.variants.length === 1 ? product.variants[0].sku : null,
      currency: tenant.currency,
      brand: tenant.business_name,
      prices: product.variants.map((v) => ({
        price: minorToDecimal(BigInt(v.priceMinor), tenant.currency_exponent),
        sku: v.sku,
        available: v.availability !== "out_of_stock",
      })),
    }),
    breadcrumbJsonLd(
      crumbs.map((c) => ({ name: c.label, url: c.href ? `${origin}/${locale}${c.href === "/" ? "" : c.href}` : url })),
    ),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structured) }} />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={crumbs} label={t("shop.breadcrumb")} />
        <div className="mt-6">
          <ProductView
            name={product.name}
            subtitle={product.subtitle}
            images={product.images}
            options={product.options}
            variants={product.variants}
            currency={tenant.currency}
            exponent={tenant.currency_exponent}
            contact={{ business: tenant.business_name, phone: tenant.phone, email: tenant.email }}
          />
        </div>
        {product.description ? (
          <section aria-labelledby="product-description" className="mt-14 max-w-3xl border-t border-border pt-10">
            <h2 id="product-description" className="font-display text-2xl font-semibold">
              {t("product.description")}
            </h2>
            <div className="mt-4 space-y-4 leading-relaxed whitespace-pre-line text-fg/90">{product.description}</div>
          </section>
        ) : null}
        {related.items.length > 0 ? (
          <section aria-labelledby="related-products" className="mt-16 border-t border-border pt-12">
            <SectionHeading id="related-products" title={t("product.related")} />
            <div className="mt-8">
              <ProductGrid>
                {related.items.map((item) => (
                  <ProductCard key={item.id} product={item} style={design.card} />
                ))}
              </ProductGrid>
            </div>
          </section>
        ) : null}
      </Container>
    </>
  );
}
