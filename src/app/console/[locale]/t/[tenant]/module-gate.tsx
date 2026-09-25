import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { findAdminModule, isFeatureEnabled, type AdminModuleKey } from "@/lib/admin/modules";
import type { TenantAdminContext } from "@/server/admin/context";

/**
 * Enforces a module's permission and plan entitlement on the page itself
 * (navigation hiding alone is not access control).
 */
export async function ModuleGate({
  context,
  moduleKey,
  children,
}: {
  context: TenantAdminContext;
  moduleKey: AdminModuleKey;
  children: ReactNode;
}) {
  const entry = findAdminModule(moduleKey);
  const t = await getTranslations("console");
  if (!entry || !context.permissions.includes(entry.permission)) {
    return <EmptyState role="alert" icon={<Lock />} title={t("forbidden.title")} description={t("forbidden.body")} />;
  }
  if (!isFeatureEnabled(context, entry.feature)) {
    const name = t(`nav.${moduleKey}`);
    return (
      <EmptyState
        icon={<Lock />}
        title={t("module.notEntitledTitle", { module: name })}
        description={t("module.notEntitledBody")}
      />
    );
  }
  return <>{children}</>;
}
