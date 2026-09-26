import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { descendantsOf, treeOrder } from "@/lib/catalog/tree";
import { asLocalizedText, pickLocalized } from "@/lib/localized";
import { publicMediaUrl } from "@/lib/storage";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { deleteCategory, updateCategory } from "../actions";
import { CategoryForm } from "../category-form";
import { DeleteCategory } from "./delete-category";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/categories/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "categories" });
  return { title: t("edit") };
}

export default async function CategoryEditPage({ params }: Props) {
  const { locale, tenant: slug, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="categories">
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
  const t = await getTranslations("categories");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  const { data: rows } = await supabase
    .from("categories")
    .select("id, name, description, slug, parent_id, status, position, image_path")
    .eq("tenant_id", context.tenant.id)
    .order("position")
    .order("created_at");
  const category = rows?.find((r) => r.id === id);
  if (!rows || !category) notFound();

  const canWrite = context.permissions.includes("catalog.write");
  const pick = (v: unknown) => pickLocalized(v, locale, settings.defaultLocale);
  const blocked = descendantsOf(rows, id);
  const parents = treeOrder(rows)
    .filter(({ row }) => !blocked.has(row.id))
    .map(({ row, depth }) => ({ value: row.id, label: `${"— ".repeat(depth)}${pick(row.name)}` }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/t/${slug}/categories`} className="text-sm text-muted hover:text-fg">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{pick(category.name)}</h1>
      </div>
      <SectionCard title={t("edit")}>
        <CategoryForm
          action={updateCategory.bind(null, slug, id)}
          locales={settings.locales}
          parents={parents}
          submitLabel={t("save")}
          disabled={!canWrite}
          withImage={{
            current: publicMediaUrl(category.image_path),
            canUpload: canWrite && context.permissions.includes("media.write"),
          }}
          category={{
            name: asLocalizedText(category.name),
            description: asLocalizedText(category.description),
            slug: category.slug,
            parentId: category.parent_id,
            status: category.status as "active",
            position: category.position,
          }}
        />
      </SectionCard>
      {canWrite ? (
        <SectionCard title={t("dangerTitle")}>
          <DeleteCategory action={deleteCategory.bind(null, slug, id)} name={pick(category.name)} />
        </SectionCard>
      ) : null}
    </div>
  );
}
