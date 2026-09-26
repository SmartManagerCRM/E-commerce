import "server-only";

import { headers } from "next/headers";

import { classifyHost } from "@/lib/hosts";
import { isActiveTenant, type ActiveStorefrontTenant } from "@/lib/tenant";
import { serverEnv } from "@/server/env";

import { resolveStorefrontTenant } from "./resolver";

/**
 * The storefront tenant for the current request, resolved from the Host
 * header — the authoritative source for any storefront write (never a route
 * param or form field). Returns null unless the tenant is active.
 */
export async function requestStorefrontTenant(): Promise<ActiveStorefrontTenant | null> {
  const env = serverEnv();
  const site = classifyHost((await headers()).get("host"), {
    rootDomain: env.PLATFORM_ROOT_DOMAIN,
    consoleSubdomain: env.CONSOLE_SUBDOMAIN,
  });
  if (site.kind !== "storefront") return null;
  const tenant = await resolveStorefrontTenant(site.lookup);
  return tenant && isActiveTenant(tenant) ? tenant : null;
}
