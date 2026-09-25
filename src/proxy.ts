import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, LOCALES, negotiateLocale, splitLocaleFromPath, type Locale } from "@/i18n/locales";
import { publicEnv } from "@/lib/env.public";
import { classifyHost } from "@/lib/hosts";
import { tenantLocales } from "@/lib/tenant";
import { serverEnv } from "@/server/env-core";
import { resolveStorefrontTenant } from "@/server/tenant/resolver";

/**
 * Request entry point (Next.js 16 "proxy", Node.js runtime).
 *
 *   hostname ──► classifyHost ──► platform | console | storefront
 *                                               │
 *                                   resolveStorefrontTenant (cached)
 *
 * Public URLs are always `/<locale>/…`; they are rewritten to internal route
 * trees that carry the area (and, for storefronts, the tenant resolved from
 * the hostname — never from client input):
 *
 *   platform    /fr/pricing      → /site/fr/pricing
 *   console     /ar/t/roasters   → /console/ar/t/roasters
 *   storefront  /en/shop         → /store/<tenant-slug>/en/shop
 */

/** Headers only the proxy may set; incoming copies are always discarded. */
const INTERNAL_HEADERS = ["x-tenant-id", "x-tenant-slug", "x-site-area", "x-next-intl-locale"];

export async function proxy(request: NextRequest) {
  const env = serverEnv();
  const site = classifyHost(request.headers.get("host"), {
    rootDomain: env.PLATFORM_ROOT_DOMAIN,
    consoleSubdomain: env.CONSOLE_SUBDOMAIN,
  });

  const { pathname, search } = request.nextUrl;
  const { locale: pathLocale, rest } = splitLocaleFromPath(pathname);
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const acceptLanguage = request.headers.get("accept-language");

  const withLocale = (allowed: readonly Locale[], fallback: Locale) => {
    if (pathLocale && allowed.includes(pathLocale)) return { redirect: null, locale: pathLocale };
    const locale = negotiateLocale({ allowed, fallback, cookie: cookieLocale, acceptLanguage });
    // A disabled locale in the URL is swapped for an allowed one; otherwise prefix.
    const target = `/${locale}${pathLocale ? rest : pathname === "/" ? "" : pathname}${search}`;
    return { redirect: sameHostRedirect(request, target, env.PUBLIC_URL_SCHEME), locale };
  };

  const requestHeaders = new Headers(request.headers);
  for (const header of INTERNAL_HEADERS) requestHeaders.delete(header);

  const rewrite = (internalPath: string, locale: Locale) => {
    requestHeaders.set("x-next-intl-locale", locale);
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    url.search = search;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  };

  switch (site.kind) {
    case "invalid":
      return new NextResponse("Unknown host", { status: 400 });

    case "platform": {
      const { redirect, locale } = withLocale(LOCALES, "en");
      if (redirect) return redirect;
      requestHeaders.set("x-site-area", "platform");
      return rewrite(`/site/${locale}${rest}`, locale);
    }

    case "console": {
      const { redirect, locale } = withLocale(LOCALES, "en");
      if (redirect) return redirect;
      requestHeaders.set("x-site-area", "console");
      return refreshSession(request, requestHeaders, (headers) => {
        headers.set("x-next-intl-locale", locale);
        const url = request.nextUrl.clone();
        url.pathname = `/console/${locale}${rest}`;
        return NextResponse.rewrite(url, { request: { headers } });
      });
    }

    case "storefront": {
      const tenant = await resolveStorefrontTenant(site.lookup);
      if (!tenant) {
        const { redirect, locale } = withLocale(LOCALES, "en");
        if (redirect) return redirect;
        return rewrite(`/site/${locale}/store-not-found`, locale);
      }

      // `/admin` on a storefront domain goes to the central console.
      if (rest === "/admin" || rest.startsWith("/admin/") || pathname === "/admin") {
        const scheme = env.PUBLIC_URL_SCHEME;
        const port = env.PUBLIC_URL_PORT ? `:${env.PUBLIC_URL_PORT}` : "";
        return NextResponse.redirect(
          `${scheme}://${env.CONSOLE_SUBDOMAIN}.${env.PLATFORM_ROOT_DOMAIN}${port}/${pathLocale ?? tenant.default_language}/t/${tenant.slug}`,
        );
      }

      const { redirect, locale } = withLocale(tenantLocales(tenant), tenant.default_language);
      if (redirect) return redirect;
      requestHeaders.set("x-site-area", "storefront");
      requestHeaders.set("x-tenant-id", tenant.id);
      requestHeaders.set("x-tenant-slug", tenant.slug);
      return rewrite(`/store/${tenant.slug}/${locale}${rest}`, locale);
    }
  }
}

/**
 * Redirect that stays on the host the visitor used. Built from the Host
 * header (already validated by classifyHost) and X-Forwarded-Proto instead of
 * request.url, which behind a reverse proxy (Hostinger/Nginx) carries the
 * upstream address such as 127.0.0.1:3000.
 */
function sameHostRedirect(request: NextRequest, path: string, defaultScheme: "http" | "https"): NextResponse {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = forwarded === "http" || forwarded === "https" ? forwarded : defaultScheme;
  return NextResponse.redirect(new URL(path, `${scheme}://${host}`), 307);
}

/**
 * Refreshes the Supabase auth session (rotating tokens when needed) and
 * forwards the updated cookies both to the page render and to the browser.
 */
async function refreshSession(
  request: NextRequest,
  requestHeaders: Headers,
  buildResponse: (headers: Headers) => NextResponse,
): Promise<NextResponse> {
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const responseHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
            pending.push(cookie);
          }
          // Cache-control headers that stop CDNs caching auth responses.
          Object.assign(responseHeaders, headers);
        },
      },
    },
  );

  // Validates the JWT and refreshes it when expired.
  await supabase.auth.getClaims();

  if (pending.length > 0) {
    requestHeaders.set("cookie", request.cookies.toString());
  }
  const response = buildResponse(requestHeaders);
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(responseHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  // Everything except Next.js internals, API routes and static files.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
