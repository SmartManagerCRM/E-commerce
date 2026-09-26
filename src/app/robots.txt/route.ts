import { requestStorefrontTenant } from "@/server/tenant/request-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

/**
 * Host-aware robots.txt: active storefronts are indexable and point to their
 * sitemap; the console, platform and inactive stores are not indexed.
 */
export async function GET() {
  const tenant = await requestStorefrontTenant();
  const body = tenant
    ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${storefrontOrigin(tenant)}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
