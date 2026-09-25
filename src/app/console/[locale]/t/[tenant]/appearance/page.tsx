import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { isLocale } from "@/i18n/locales";
import { publicMediaUrl } from "@/lib/storage";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";
import { storefrontOrigin } from "@/server/tenant/urls";
import { getTheme, type ThemeKey } from "@/themes/definitions";

import { removeBranding, updateAppearance, uploadBranding } from "./actions";
import { BrandingForm } from "./branding-form";
import { ThemeForm } from "./theme-form";
import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/appearance">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("appearance") };
}

export default async function AppearancePage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="appearance">
      <AppearanceContent slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function AppearanceContent({
  slug,
  locale,
  context,
}: {
  slug: string;
  locale: string;
  context: TenantAdminContext;
}) {
  const t = await getTranslations("appearance");
  const supabase = await createUserClient();
  const [{ data: config }, { data: tenant }] = await Promise.all([
    supabase.from("storefront_configs").select("theme_key, tokens").eq("tenant_id", context.tenant.id).single(),
    supabase.from("tenants").select("logo_path, favicon_path").eq("id", context.tenant.id).single(),
  ]);
  if (!config || !tenant) throw new Error("Failed to load appearance");

  const colors = ((config.tokens as { colors?: Record<string, string> })?.colors ?? {}) as Record<string, string>;
  const canEdit = context.permissions.includes("appearance.write");
  const canEditBranding = canEdit && context.permissions.includes("settings.write");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <a
          href={`${storefrontOrigin({ slug })}/${locale}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
        >
          {t("viewStore")}
          <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </a>
      </div>

      <SectionCard title={t("brandTitle")} description={t("brandDescription")}>
        <div className="space-y-8">
          <BrandingForm
            kind="logo"
            currentUrl={publicMediaUrl(tenant.logo_path)}
            upload={uploadBranding.bind(null, slug, "logo")}
            remove={removeBranding.bind(null, slug, "logo")}
            canEdit={canEditBranding}
          />
          <BrandingForm
            kind="favicon"
            currentUrl={publicMediaUrl(tenant.favicon_path)}
            upload={uploadBranding.bind(null, slug, "favicon")}
            remove={removeBranding.bind(null, slug, "favicon")}
            canEdit={canEditBranding}
          />
        </div>
      </SectionCard>

      <SectionCard title={t("styleTitle")} description={t("styleDescription")}>
        <ThemeForm
          action={updateAppearance.bind(null, slug)}
          themeKey={getTheme(config.theme_key).key as ThemeKey}
          primary={colors.primary ?? ""}
          accent={colors.accent ?? ""}
          canEdit={canEdit}
        />
      </SectionCard>
    </div>
  );
}
