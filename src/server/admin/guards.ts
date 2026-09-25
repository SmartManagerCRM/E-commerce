import "server-only";

import { getLocale } from "next-intl/server";

import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { invalidateTenantCache } from "@/server/tenant/resolver";

import { requireTenantAdmin, type TenantAdminContext } from "./context";

/**
 * Loads the admin context for a Server Action and asserts a permission.
 * Returns null when the caller lacks it (the action then returns an error).
 */
export async function actionContext(slug: string, permission: string): Promise<TenantAdminContext | null> {
  const locale = await getLocale();
  const context = await requireTenantAdmin(isLocale(locale) ? locale : DEFAULT_LOCALE, slug);
  return context.permissions.includes(permission) ? context : null;
}

/** Storefront-visible data changed: drop cached tenant resolutions in this process. */
export function storefrontChanged() {
  invalidateTenantCache();
}
