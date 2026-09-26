import { tenantLocales } from "@/lib/tenant";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * Per-tenant sitemap with hreflang alternates. Catalog URLs are added when
 * products and categories exist (Phase 4).
 */
export async function GET() {
  const tenant = await requestStorefrontTenant();
  if (!tenant) return new Response("Not found", { status: 404 });

  const origin = storefrontOrigin(tenant);
  const locales = tenantLocales(tenant);
  const paths = [""];
  const urls = paths.flatMap((path) =>
    locales.map((locale) => {
      const alternates = locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(`${origin}/${l}${path}`)}"/>`)
        .join("");
      return `<url><loc>${escapeXml(`${origin}/${locale}${path}`)}</loc>${alternates}</url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
