/**
 * Pure host classification — no I/O, so it is shared by the proxy, server
 * components and unit tests.
 *
 *   e-commerce.smartmanager.me            → platform marketing site
 *   app.e-commerce.smartmanager.me        → admin console + Super Admin
 *   roasters.e-commerce.smartmanager.me   → storefront (tenant slug "roasters")
 *   roasters.com / www.roasters.com      → storefront (custom domain lookup)
 */
export type HostConfig = {
  rootDomain: string;
  consoleSubdomain: string;
};

export type SiteTarget =
  | { kind: "platform" }
  | { kind: "console" }
  | { kind: "storefront"; lookup: { by: "slug"; slug: string } | { by: "hostname"; hostname: string } }
  | { kind: "invalid" };

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Lower-cases, strips the port, a trailing dot and a leading `www.`. */
export function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return "";
  let host = rawHost.trim().toLowerCase();
  // IPv6 literals are not valid tenant hosts; keep them unmatched.
  if (host.startsWith("[")) return host;
  host = host.replace(/:\d+$/, "").replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

export function classifyHost(rawHost: string | null | undefined, config: HostConfig): SiteTarget {
  const host = normalizeHost(rawHost);
  const root = config.rootDomain.toLowerCase();
  if (!host) return { kind: "invalid" };

  if (host === root) return { kind: "platform" };

  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub === config.consoleSubdomain) return { kind: "console" };
    // Only a single-label subdomain can be a tenant slug.
    if (!sub.includes(".") && SLUG_PATTERN.test(sub)) {
      return { kind: "storefront", lookup: { by: "slug", slug: sub } };
    }
    return { kind: "invalid" };
  }

  if (HOSTNAME_PATTERN.test(host)) {
    return { kind: "storefront", lookup: { by: "hostname", hostname: host } };
  }
  return { kind: "invalid" };
}

/** Builds an absolute origin for a platform host, e.g. the console. */
export function platformOrigin(
  subdomain: string | null,
  config: HostConfig & { scheme: "http" | "https"; port?: string },
): string {
  const host = subdomain ? `${subdomain}.${config.rootDomain}` : config.rootDomain;
  return `${config.scheme}://${host}${config.port ? `:${config.port}` : ""}`;
}
