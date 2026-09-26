import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { RenderSections } from "@/components/store/sections/render-sections";
import { isActiveTenant, tenantLocales } from "@/lib/tenant";
import { getStorefrontTenant, isTenantLocale } from "@/server/tenant/storefront";
import { homepageSections, storefrontDesign } from "@/server/storefront/homepage";
import { storefrontOrigin } from "@/server/tenant/urls";

export async function generateMetadata({ params }: PageProps<"/store/[tenant]/[locale]">): Promise<Metadata> {
  const { tenant: slug, locale } = await params;
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isActiveTenant(tenant) || !isTenantLocale(tenant, locale)) return {};
  const origin = storefrontOrigin(tenant);
  return {
    alternates: {
      canonical: `${origin}/${locale}`,
      languages: Object.fromEntries(tenantLocales(tenant).map((l) => [l, `${origin}/${l}`])),
    },
  };
}

/** Storefront home: the tenant's configured sections, in order. */
export default async function StoreHomePage({ params }: PageProps<"/store/[tenant]/[locale]">) {
  const { tenant: slug, locale } = await params;
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isActiveTenant(tenant) || !isTenantLocale(tenant, locale)) notFound();
  setRequestLocale(locale);

  return (
    <RenderSections sections={homepageSections(tenant)} ctx={{ locale, tenant, design: storefrontDesign(tenant) }} />
  );
}
