import { z } from "zod";

import { tenantLocales } from "@/lib/tenant";
import { anonymousClient } from "@/server/supabase/clients";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

const sitemapSchema = z.object({
  products: z.array(z.object({ slug: z.string(), updated_at: z.string() })),
  categories: z.array(z.object({ slug: z.string(), updated_at: z.string() })),
});

/** Per-tenant sitemap with hreflang alternates: home, shop, categories and products. */
export async function GET() {
  const tenant = await requestStorefrontTenant();
  if (!tenant) return new Response("Not found", { status: 404 });

  const origin = storefrontOrigin(tenant);
  const locales = tenantLocales(tenant);
  const { data } = await anonymousClient().rpc("storefront_sitemap", { p_tenant: tenant.id });
  const catalog = sitemapSchema.safeParse(data).data ?? { products: [], categories: [] };

  const paths: { path: string; lastmod?: string }[] = [{ path: "" }];
  if (catalog.products.length > 0) {
    paths.push({ path: "/shop" });
    for (const c of catalog.categories) paths.push({ path: `/shop/${c.slug}`, lastmod: c.updated_at });
    for (const p of catalog.products) paths.push({ path: `/products/${p.slug}`, lastmod: p.updated_at });
  }
  const urls = paths.flatMap(({ path, lastmod }) =>
    locales.map((locale) => {
      const alternates = locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(`${origin}/${l}${path}`)}"/>`)
        .join("");
      const modified = lastmod ? `<lastmod>${escapeXml(new Date(lastmod).toISOString())}</lastmod>` : "";
      return `<url><loc>${escapeXml(`${origin}/${locale}${path}`)}</loc>${modified}${alternates}</url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
