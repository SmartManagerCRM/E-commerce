import type { Metadata } from "next";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { SECTION_REGISTRY, SECTION_TYPES } from "@/lib/storefront/sections";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";
import { storefrontOrigin } from "@/server/tenant/urls";

import { addSection, moveSection, removeSection, toggleSection, updateSection } from "./actions";
import { IconAction } from "./icon-action";
import { loadEditableSections } from "./load";
import { SectionForm } from "./section-form";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/appearance/homepage">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "homepageEditor" });
  return { title: t("title") };
}

export default async function HomepageEditorPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="appearance">
      <Editor slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function Editor({ slug, locale, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("homepageEditor");
  const canEdit = context.permissions.includes("appearance.write");
  const sections = await loadEditableSections(context);
  const supabase = await createUserClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("enabled_languages")
    .eq("id", context.tenant.id)
    .single();
  const locales = (tenant?.enabled_languages ?? [locale]) as Locale[];

  const addable = SECTION_TYPES.filter(
    (type) =>
      SECTION_REGISTRY[type].available && (SECTION_REGISTRY[type].multiple || !sections.some((s) => s.type === type)),
  );
  const upcoming = SECTION_TYPES.filter((type) => !SECTION_REGISTRY[type].available);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/t/${slug}/appearance`} className="text-sm text-muted hover:text-fg">
            ← {t("back")}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <a
          href={`${storefrontOrigin({ slug })}/${locale}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary-text hover:underline"
        >
          {t("viewStore")}
        </a>
      </div>

      <ol className="space-y-3">
        {sections.map((section, index) => {
          const name = t(`types.${section.type}`);
          return (
            <li key={section.id} className="rounded-lg border border-border bg-surface shadow-card">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="text-xs text-muted tabular-nums">{index + 1}</span>
                <span className="flex-1 font-medium">{name}</span>
                <Badge tone={section.enabled ? "success" : "neutral"}>
                  {section.enabled ? t("shown") : t("hidden")}
                </Badge>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <IconAction
                      action={moveSection.bind(null, slug)}
                      id={section.id}
                      extra={{ direction: "up" }}
                      label={t("moveUpNamed", { name })}
                      disabled={index === 0}
                      icon={<ArrowUp className="size-4" aria-hidden="true" />}
                    />
                    <IconAction
                      action={moveSection.bind(null, slug)}
                      id={section.id}
                      extra={{ direction: "down" }}
                      label={t("moveDownNamed", { name })}
                      disabled={index === sections.length - 1}
                      icon={<ArrowDown className="size-4" aria-hidden="true" />}
                    />
                    <IconAction
                      action={toggleSection.bind(null, slug)}
                      id={section.id}
                      label={section.enabled ? t("hideNamed", { name }) : t("showNamed", { name })}
                      icon={
                        section.enabled ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )
                      }
                    />
                    <IconAction
                      action={removeSection.bind(null, slug)}
                      id={section.id}
                      label={t("removeNamed", { name })}
                      icon={<Trash2 className="size-4" aria-hidden="true" />}
                    />
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <details className="group border-t border-border">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-primary-text sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">{t("edit", { name })}</span>
                    <span className="hidden group-open:inline">{t("closeEditor")}</span>
                  </summary>
                  <div className="px-4 pb-5 sm:px-5">
                    <SectionForm section={section} action={updateSection.bind(null, slug)} locales={locales} />
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>

      {canEdit && addable.length > 0 ? (
        <SectionCard title={t("addTitle")}>
          <ActionForm action={addSection.bind(null, slug)} submitLabel={t("add")} size="md">
            <div className="space-y-1.5">
              <label htmlFor="new-section-type" className="block text-sm font-medium">
                {t("sectionType")}
              </label>
              <select
                id="new-section-type"
                name="type"
                className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {addable.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          </ActionForm>
        </SectionCard>
      ) : null}

      <SectionCard title={t("upcomingTitle")} description={t("upcomingDescription")}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {upcoming.map((type) => {
            const reg = SECTION_REGISTRY[type];
            return (
              <li key={type} className="flex items-center justify-between gap-3 rounded-md bg-bg px-3 py-2">
                <span>{t(`types.${type}`)}</span>
                <span className="text-xs text-muted">{!reg.available ? t(`requires.${reg.reason}`) : null}</span>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
