import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import type { EditorOption, EditorVariant } from "@/lib/catalog/structure";
import { asLocalizedText, pickLocalized } from "@/lib/localized";
import { minorToDecimal } from "@/lib/money";
import { publicMediaUrl } from "@/lib/storage";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";
import { storefrontOrigin } from "@/server/tenant/urls";

import {
  deleteProduct,
  saveProductStructure,
  updateProductDetails,
  updateProductImage,
  uploadProductImages,
} from "../actions";
import { DeleteProduct } from "./delete-product";
import { DetailsForm } from "./details-form";
import { ImageManager } from "./image-manager";
import { StructureEditor } from "./structure-editor";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/products/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "products" });
  return { title: t("edit") };
}

export default async function ProductEditorPage({ params }: Props) {
  const { locale, tenant: slug, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="products">
      <Editor slug={slug} locale={locale} id={id} context={context} />
    </ModuleGate>
  );
}

async function Editor({
  slug,
  locale,
  id,
  context,
}: {
  slug: string;
  locale: Locale;
  id: string;
  context: TenantAdminContext;
}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("products");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, subtitle, description, slug, status, featured")
    .eq("tenant_id", context.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!product) notFound();

  const [{ data: categories }, { data: links }, { data: options }, { data: variants }, { data: images }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("tenant_id", context.tenant.id)
        .order("position")
        .order("created_at"),
      supabase.from("product_categories").select("category_id").eq("product_id", id),
      supabase
        .from("product_options")
        .select("id, name, position, product_option_values(id, label, position)")
        .eq("product_id", id)
        .order("position"),
      supabase
        .from("product_variants")
        .select(
          "id, option_value_ids, price_minor, compare_at_minor, sku, weight_g, image_id, position, inventory_items(on_hand, reserved, track_stock)",
        )
        .eq("product_id", id)
        .eq("status", "active")
        .order("position"),
      supabase
        .from("product_images")
        .select("id, storage_path, alt, position, width, height")
        .eq("product_id", id)
        .order("position"),
      supabase.from("tenants").select("slug, primary_domain, status").eq("id", context.tenant.id).single(),
    ]);

  const canWrite = context.permissions.includes("catalog.write");
  const canStock = context.permissions.includes("inventory.write") && context.features.inventory?.enabled === true;
  const pick = (value: unknown) => pickLocalized(value, locale, settings.defaultLocale);
  const decimal = (minor: number | null) => (minor === null ? "" : minorToDecimal(BigInt(minor), settings.exponent));

  const editorOptions: EditorOption[] = (options ?? []).map((o) => ({
    id: o.id,
    key: o.id,
    name: asLocalizedText(o.name),
    values: [...(o.product_option_values ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({ id: v.id, key: v.id, label: asLocalizedText(v.label) })),
  }));
  const valueOrder = new Map(editorOptions.flatMap((o, i) => o.values.map((v) => [v.id!, i] as const)));
  const editorVariants: EditorVariant[] = (variants ?? []).map((v) => {
    const stock = (v.inventory_items ?? [])[0];
    return {
      id: v.id,
      keys: [...v.option_value_ids].sort((a, b) => (valueOrder.get(a) ?? 0) - (valueOrder.get(b) ?? 0)),
      price: decimal(v.price_minor),
      compare_at: decimal(v.compare_at_minor),
      sku: v.sku ?? "",
      weight_g: v.weight_g === null ? "" : String(v.weight_g),
      image_id: v.image_id ?? "",
      initial_stock: "",
      on_hand: stock && stock.track_stock ? stock.on_hand - stock.reserved : null,
    };
  });

  const imageViews = (images ?? []).map((i) => ({
    id: i.id,
    src: publicMediaUrl(i.storage_path)!,
    alt: asLocalizedText(i.alt),
  }));
  const categoryOptions = (categories ?? []).map((c) => ({
    id: c.id,
    label: c.parent_id
      ? `${pick(categories?.find((p) => p.id === c.parent_id)?.name)} › ${pick(c.name)}`
      : pick(c.name),
  }));
  const storeUrl =
    product.status === "active" && context.tenant.status === "active"
      ? `${storefrontOrigin({ slug })}/${settings.defaultLocale}/products/${product.slug}`
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/t/${slug}/products`} className="text-sm text-muted hover:text-fg">
            ← {t("title")}
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{pick(product.name) || t("untitled")}</h1>
        </div>
        {storeUrl ? (
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {t("viewInStore")}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <SectionCard title={t("detailsTitle")}>
        <DetailsForm
          action={updateProductDetails.bind(null, slug, id)}
          locales={settings.locales}
          disabled={!canWrite}
          categories={categoryOptions}
          product={{
            name: asLocalizedText(product.name),
            subtitle: asLocalizedText(product.subtitle),
            description: asLocalizedText(product.description),
            slug: product.slug,
            status: product.status as "draft",
            featured: product.featured,
            categoryIds: (links ?? []).map((l) => l.category_id),
          }}
        />
      </SectionCard>

      <SectionCard title={t("imagesTitle")} description={t("imagesDescription")}>
        <ImageManager
          images={imageViews}
          locales={settings.locales}
          canEdit={canWrite}
          canUpload={canWrite && context.permissions.includes("media.write")}
          uploadAction={uploadProductImages.bind(null, slug, id)}
          imageAction={updateProductImage.bind(null, slug, id)}
        />
      </SectionCard>

      <SectionCard title={t("variantsTitle")} description={t("variantsDescription")}>
        <StructureEditor
          // Remount after each save so rows pick up the ids the database assigned.
          key={[
            ...editorOptions.flatMap((o) => [o.id, ...o.values.map((v) => v.id)]),
            ...editorVariants.map((v) => v.id),
          ].join()}
          action={saveProductStructure.bind(null, slug, id)}
          locales={settings.locales}
          defaultLocale={settings.defaultLocale}
          uiLocale={locale}
          currency={settings.currency}
          exponent={settings.exponent}
          canEdit={canWrite}
          canStock={canStock}
          images={imageViews.map((i, n) => ({ id: i.id, label: t("imageN", { n: n + 1 }) }))}
          initialOptions={editorOptions}
          initialVariants={editorVariants}
        />
      </SectionCard>

      {canWrite ? (
        <SectionCard title={t("dangerTitle")}>
          <DeleteProduct action={deleteProduct.bind(null, slug, id)} name={pick(product.name)} />
        </SectionCard>
      ) : null}
    </div>
  );
}
