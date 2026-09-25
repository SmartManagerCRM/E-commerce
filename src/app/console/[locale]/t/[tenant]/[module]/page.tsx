import type { Metadata } from "next";
import { Construction, Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EmptyState } from "@/components/ui/empty-state";
import { isLocale } from "@/i18n/locales";
import { findAdminModule, isFeatureEnabled, type AdminModuleKey } from "@/lib/admin/modules";
import { requireTenantAdmin } from "@/server/admin/context";

type Props = PageProps<"/console/[locale]/t/[tenant]/[module]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, module } = await params;
  const entry = findAdminModule(module);
  if (!isLocale(locale) || !entry) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t(entry.key as AdminModuleKey) };
}

/**
 * Module route. Modules not yet implemented say so explicitly — nothing is
 * presented as working until it is. Access rules are enforced here too, not
 * only by hiding navigation items.
 */
export default async function ModulePage({ params }: Props) {
  const { locale, tenant: slug, module } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const entry = findAdminModule(module);
  if (!entry || entry.key === "dashboard") notFound();

  const context = await requireTenantAdmin(locale, slug);

  const t = await getTranslations("console");
  const name = t(`nav.${entry.key as AdminModuleKey}`);

  if (!context.permissions.includes(entry.permission)) {
    return <EmptyState role="alert" icon={<Lock />} title={t("forbidden.title")} description={t("forbidden.body")} />;
  }

  if (!isFeatureEnabled(context, entry.feature)) {
    return (
      <EmptyState
        icon={<Lock />}
        title={t("module.notEntitledTitle", { module: name })}
        description={t("module.notEntitledBody")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <EmptyState
        icon={<Construction />}
        title={t("module.notBuiltTitle", { module: name })}
        description={t("module.notBuiltBody")}
      />
    </div>
  );
}
