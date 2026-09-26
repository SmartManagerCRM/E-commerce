import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { CSSProperties } from "react";

import "../../../globals.css";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { StoreUnavailable } from "@/components/store/store-unavailable";
import { anchorsFor } from "@/components/store/sections/render-sections";
import { ToastProvider } from "@/components/ui/toast";
import { localeDirection } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { publicMediaUrl } from "@/lib/storage";
import { isActiveTenant, tenantLocales } from "@/lib/tenant";
import { businessJsonLd, jsonLdScript } from "@/lib/storefront/structured-data";
import { getTheme } from "@/themes/definitions";
import { storefrontFontClasses } from "@/themes/fonts";
import { themeCssVariables } from "@/themes/tokens";
import { homepageSections, storefrontDesign } from "@/server/storefront/homepage";
import { getStorefrontTenant, isTenantLocale } from "@/server/tenant/storefront";
import { storefrontOrigin } from "@/server/tenant/urls";

export async function generateMetadata({ params }: LayoutProps<"/store/[tenant]/[locale]">): Promise<Metadata> {
  const { tenant: slug, locale } = await params;
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isTenantLocale(tenant, locale)) return {};

  if (!isActiveTenant(tenant)) {
    return { title: tenant.business_name, robots: { index: false, follow: false } };
  }

  const description = pickLocalized(tenant.description, locale, tenant.default_language) || undefined;
  const favicon = publicMediaUrl(tenant.favicon_path);
  return {
    metadataBase: new URL(storefrontOrigin(tenant)),
    title: { default: tenant.business_name, template: `%s · ${tenant.business_name}` },
    description,
    applicationName: tenant.business_name,
    openGraph: { siteName: tenant.business_name, locale, type: "website", description },
    twitter: { card: "summary_large_image", title: tenant.business_name, description },
    icons: favicon ? { icon: favicon } : undefined,
  };
}

export async function generateViewport({ params }: LayoutProps<"/store/[tenant]/[locale]">): Promise<Viewport> {
  const { tenant: slug } = await params;
  const tenant = await getStorefrontTenant(slug);
  const theme = getTheme(tenant && isActiveTenant(tenant) ? tenant.storefront.theme_key : null);
  return { themeColor: theme.colors.background, width: "device-width", initialScale: 1 };
}

export default async function StoreLayout({ children, params }: LayoutProps<"/store/[tenant]/[locale]">) {
  const { tenant: slug, locale } = await params;
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isTenantLocale(tenant, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("common");
  const tNav = await getTranslations("store.nav");
  const dir = localeDirection(locale);
  const rtl = dir === "rtl";

  if (!isActiveTenant(tenant)) {
    const theme = getTheme(null);
    return (
      <html lang={locale} dir={dir} className={storefrontFontClasses(theme.displayFont, rtl)}>
        <body className="flex min-h-dvh flex-col">
          <NextIntlClientProvider>
            <main id="main" className="flex flex-1">
              <StoreUnavailable name={tenant.business_name} status={tenant.status} />
            </main>
          </NextIntlClientProvider>
        </body>
      </html>
    );
  }

  const design = storefrontDesign(tenant);
  const style = themeCssVariables(design.theme.key, tenant.storefront.tokens, {
    fontRole: design.fontRole,
    button: design.button,
  }) as CSSProperties;

  // Header navigation mirrors the sections actually shown on the homepage.
  const anchors = new Set(anchorsFor(homepageSections(tenant)).values());
  const nav = [
    { label: tNav("home"), href: "/" },
    ...(anchors.has("story") ? [{ label: tNav("about"), href: "/", hash: "story" }] : []),
    ...(anchors.has("visit") ? [{ label: tNav("visit"), href: "/", hash: "visit" }] : []),
    ...(anchors.has("newsletter") ? [{ label: tNav("newsletter"), href: "/", hash: "newsletter" }] : []),
  ];
  const origin = storefrontOrigin(tenant);

  return (
    <html lang={locale} dir={dir} style={style} className={storefrontFontClasses(design.fontRole, rtl)}>
      <body className="flex min-h-dvh flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(businessJsonLd(tenant, locale, origin, publicMediaUrl(tenant.logo_path))),
          }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <ToastProvider dismissLabel={t("close")}>
            <StoreHeader
              businessName={tenant.business_name}
              logoPath={tenant.logo_path}
              locales={tenantLocales(tenant)}
              layout={design.headerLayout}
              sticky={design.stickyHeader}
              announcement={pickLocalized(design.announcement, locale, tenant.default_language)}
              nav={nav}
              labels={{ mainNavigation: tNav("mainNavigation"), menu: t("openMenu"), close: t("closeMenu") }}
            />
            <main id="main" className="flex-1">
              {children}
            </main>
            <StoreFooter tenant={tenant} locale={locale} social={design.social} />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
