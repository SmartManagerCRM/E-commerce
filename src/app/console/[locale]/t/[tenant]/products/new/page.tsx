import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { requireTenantAdmin } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";

import { createProduct } from "../actions";
import { NewProductForm } from "./new-product-form";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/products/new">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "products" });
  return { title: t("new") };
}

export default async function NewProductPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  const t = await getTranslations("products");
  const settings = await catalogSettings(context);
  const canWrite = context.permissions.includes("catalog.write");
  return (
    <ModuleGate context={context} moduleKey="products">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href={`/t/${slug}/products`} className="text-sm text-muted hover:text-fg">
            ← {t("title")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("new")}</h1>
          <p className="mt-1 text-sm text-muted">{t("newSubtitle")}</p>
        </div>
        {canWrite ? (
          <SectionCard title={t("basics")}>
            <NewProductForm
              action={createProduct.bind(null, slug)}
              locales={settings.locales}
              currency={settings.currency}
              exponent={settings.exponent}
            />
          </SectionCard>
        ) : (
          <p role="alert" className="text-sm text-danger">
            {t("readOnly")}
          </p>
        )}
      </div>
    </ModuleGate>
  );
}
