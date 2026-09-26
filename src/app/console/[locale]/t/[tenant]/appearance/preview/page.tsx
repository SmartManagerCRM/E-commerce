import type { Metadata } from "next";
import { Info } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { CSSProperties } from "react";

import { ProductCard, ProductGrid } from "@/components/store/product-card";
import { SectionHeading } from "@/components/store/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isLocale, localeDirection, type Locale } from "@/i18n/locales";
import { resolveStorefrontDesign } from "@/lib/storefront/design";
import type { PriceView, ProductCardView } from "@/lib/storefront/catalog-types";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";
import { storefrontFontClasses } from "@/themes/fonts";
import { themeCssVariables } from "@/themes/tokens";

import { PreviewProductDetail } from "./preview-product-detail";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/appearance/preview">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "designPreview" });
  return { title: t("title") };
}

export default async function DesignPreviewPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="appearance">
      <Preview slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function Preview({ slug, locale, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("designPreview");
  const supabase = await createUserClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase
      .from("storefront_configs")
      .select("theme_key, tokens, header, footer")
      .eq("tenant_id", context.tenant.id)
      .single(),
    supabase.from("tenants").select("currency").eq("id", context.tenant.id).single(),
  ]);
  if (!config || !tenant) throw new Error("Failed to load design");
  const { data: currency } = await supabase.from("currencies").select("exponent").eq("code", tenant.currency).single();

  const design = resolveStorefrontDesign(config);
  const style = themeCssVariables(design.theme.key, config.tokens, {
    fontRole: design.fontRole,
    button: design.button,
  }) as CSSProperties;
  const exponent = currency?.exponent ?? 2;
  const price = (major: number, compareAt?: number): PriceView => ({
    amountMinor: BigInt(major) * BigInt(10) ** BigInt(exponent),
    compareAtMinor: compareAt ? BigInt(compareAt) * BigInt(10) ** BigInt(exponent) : null,
    currency: tenant.currency,
    exponent,
  });
  const img = (n: number) => ({ src: `/preview/product-${n}.webp`, alt: "" });

  const products: ProductCardView[] = [
    {
      id: "1",
      href: "#",
      name: t("samples.p1"),
      subtitle: t("samples.p1Sub"),
      image: img(1),
      hoverImage: img(5),
      price: price(45),
      optionsLabel: t("samples.sizes", { count: 3 }),
      rating: { value: 4.9, count: 128 },
      badges: ["bestseller"],
      availability: "in_stock",
    },
    {
      id: "2",
      href: "#",
      name: t("samples.p2"),
      subtitle: t("samples.p2Sub"),
      image: img(2),
      price: price(38, 48),
      badges: ["sale"],
      availability: "in_stock",
    },
    {
      id: "3",
      href: "#",
      name: t("samples.p3"),
      subtitle: t("samples.p3Sub"),
      image: img(3),
      price: price(52),
      badges: ["new"],
      availability: "low_stock",
      rating: { value: 4.6, count: 41 },
    },
    {
      id: "4",
      href: "#",
      name: t("samples.p4"),
      subtitle: t("samples.p4Sub"),
      image: img(4),
      price: price(29),
      availability: "out_of_stock",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/t/${slug}/appearance`} className="text-sm text-muted hover:text-fg">
            ← {t("back")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
      </div>
      <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        {t("notice")}
      </p>

      <div
        style={style}
        dir={localeDirection(locale)}
        className={`${storefrontFontClasses(design.fontRole, localeDirection(locale) === "rtl")} overflow-hidden rounded-lg border border-border bg-bg font-sans text-fg`}
      >
        <div className="space-y-20 p-6 sm:p-10">
          <section aria-labelledby="pv-type" className="space-y-6">
            <p className="text-xs font-medium tracking-[0.2em] text-accent-text uppercase rtl:tracking-normal">
              {t("typeEyebrow")}
            </p>
            <h2 id="pv-type" className="font-display text-display-lg font-semibold text-balance rtl:leading-snug">
              {t("typeHeadline")}
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted">{t("typeBody")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button">{t("primaryButton")}</Button>
              <Button type="button" variant="secondary">
                {t("secondaryButton")}
              </Button>
              <Button type="button" variant="ghost">
                {t("ghostButton")}
              </Button>
              <Button type="button" variant="link">
                {t("linkButton")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{t("badgeSale")}</Badge>
              <Badge tone="accent">{t("badgeNew")}</Badge>
              <Badge tone="outline">{t("badgeOutline")}</Badge>
              <Badge tone="success">{t("badgeSuccess")}</Badge>
            </div>
          </section>

          <section aria-labelledby="pv-grid" className="space-y-8">
            <SectionHeading id="pv-grid" eyebrow={t("gridEyebrow")} title={t("gridTitle")} />
            <ProductGrid>
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} style={design.card} priority={i < 2} />
              ))}
            </ProductGrid>
          </section>

          <section aria-labelledby="pv-detail" className="space-y-8">
            <h2 id="pv-detail" className="sr-only">
              {t("detailTitle")}
            </h2>
            <PreviewProductDetail
              name={t("samples.p1")}
              description={t("samples.p1Description")}
              images={[img(1), img(5), img(3)].map((i) => ({ ...i, alt: t("samples.p1") }))}
              variants={[
                { id: "250", label: "250g", available: true, price: price(45) },
                { id: "500", label: "500g", available: true, price: price(82) },
                { id: "1000", label: "1kg", available: false, price: price(150) },
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
