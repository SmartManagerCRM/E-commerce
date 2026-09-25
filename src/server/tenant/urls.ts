import "server-only";

import { serverEnv } from "@/server/env";

/** Canonical public origin of a storefront: its primary custom domain, else its platform subdomain. */
export function storefrontOrigin(tenant: { slug: string; primary_domain?: string | null }): string {
  const env = serverEnv();
  if (tenant.primary_domain) return `https://${tenant.primary_domain}`;
  const port = env.PUBLIC_URL_PORT ? `:${env.PUBLIC_URL_PORT}` : "";
  return `${env.PUBLIC_URL_SCHEME}://${tenant.slug}.${env.PLATFORM_ROOT_DOMAIN}${port}`;
}

export function consoleOrigin(): string {
  const env = serverEnv();
  const port = env.PUBLIC_URL_PORT ? `:${env.PUBLIC_URL_PORT}` : "";
  return `${env.PUBLIC_URL_SCHEME}://${env.CONSOLE_SUBDOMAIN}.${env.PLATFORM_ROOT_DOMAIN}${port}`;
}
