import type { Metadata } from "next";
import { FolderTree } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { treeOrder } from "@/lib/catalog/tree";
import { pickLocalized } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

import { createCategory } from "./actions";
import { CategoryForm } from "./category-form";
import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/categories">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("categories") };
}

export default async function CategoriesPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="categories">
      <Categories slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function Categories({ slug, locale, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("categories");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  const { data: rows, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, status, position, product_categories(count)")
    .eq("tenant_id", context.tenant.id)
    .order("position")
    .order("created_at");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);

  const canWrite = context.permissions.includes("catalog.write");
  const pick = (v: unknown) => pickLocalized(v, locale, settings.defaultLocale);
  const tree = treeOrder(rows ?? []);
  const parents = tree.map(({ row, depth }) => ({ value: row.id, label: `${"— ".repeat(depth)}${pick(row.name)}` }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {tree.length > 0 ? (
        <SectionCard title={t("listTitle")}>
          <ul className="divide-y divide-border">
            {tree.map(({ row, depth }) => {
              const count = (row.product_categories as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  style={{ paddingInlineStart: `${depth * 1.5}rem` }}
                >
                  <div className="min-w-0">
                    <Link href={`/t/${slug}/categories/${row.id}`} className="font-medium hover:underline">
                      {pick(row.name)}
                    </Link>
                    <p className="text-xs text-muted">
                      <span dir="ltr">/shop/{row.slug}</span> · {t("productCount", { count })}
                    </p>
                  </div>
                  {row.status === "hidden" ? <Badge tone="outline">{t("status.hidden")}</Badge> : null}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : (
        <EmptyState icon={<FolderTree />} title={t("emptyTitle")} description={t("emptyBody")} />
      )}

      {canWrite ? (
        <SectionCard title={t("newTitle")}>
          <CategoryForm
            action={createCategory.bind(null, slug)}
            locales={settings.locales}
            parents={parents}
            submitLabel={t("create")}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
