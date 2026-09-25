import type { Metadata } from "next";
import { MapPin, Phone, Mail } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { formatAddress } from "@/lib/address";
import { pickLocalized } from "@/lib/localized";
import { isActiveTenant, tenantLocales } from "@/lib/tenant";
import { getStorefrontTenant, isTenantLocale } from "@/server/tenant/storefront";
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

/**
 * Storefront home — Phase 1 shell. It renders the tenant's real profile
 * (name, tagline, description, contact); catalog sections replace the
 * "being prepared" notice once products exist (Phases 3–4).
 */
export default async function StoreHomePage({ params }: PageProps<"/store/[tenant]/[locale]">) {
  const { tenant: slug, locale } = await params;
  const tenant = await getStorefrontTenant(slug);
  if (!tenant || !isActiveTenant(tenant) || !isTenantLocale(tenant, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("store.home");
  const tagline = pickLocalized(tenant.tagline, locale, tenant.default_language);
  const description = pickLocalized(tenant.description, locale, tenant.default_language);
  const address = formatAddress(tenant.address);

  return (
    <>
      <section className="border-b border-border">
        <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-8">
            {tagline ? (
              <p className="mb-6 text-sm font-medium tracking-[0.18em] text-accent-text uppercase rtl:tracking-normal">
                {tagline}
              </p>
            ) : null}
            <h1 className="font-display text-display-xl font-semibold text-balance rtl:leading-[1.3]">
              {t("welcome", { name: tenant.business_name })}
            </h1>
            {description ? (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted text-pretty">{description}</p>
            ) : null}
          </div>
        </Container>
      </section>

      <section aria-labelledby="opening-soon">
        <Container className="grid gap-8 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 id="opening-soon" className="font-display text-display-md font-semibold rtl:leading-snug">
              {t("openingSoonTitle")}
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">{t("openingSoonBody")}</p>
          </div>

          {address || tenant.phone || tenant.email ? (
            <div className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8 lg:col-span-5">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase rtl:tracking-normal">
                {t("visitUs")}
              </h3>
              <ul className="mt-5 space-y-4 text-sm">
                {address ? (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                    <span>{address}</span>
                  </li>
                ) : null}
                {tenant.phone ? (
                  <li className="flex gap-3">
                    <Phone className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                    <a href={`tel:${tenant.phone.replace(/\s+/g, "")}`} dir="ltr" className="hover:underline">
                      {tenant.phone}
                    </a>
                  </li>
                ) : null}
                {tenant.email ? (
                  <li className="flex gap-3">
                    <Mail className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
                    <a href={`mailto:${tenant.email}`} className="hover:underline">
                      {tenant.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </Container>
      </section>
    </>
  );
}
