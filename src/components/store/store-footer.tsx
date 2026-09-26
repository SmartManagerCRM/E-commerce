import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { formatAddress } from "@/lib/address";
import { pickLocalized } from "@/lib/localized";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/storefront/design";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import type { Locale } from "@/i18n/locales";

const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  snapchat: "Snapchat",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
};

export async function StoreFooter({
  tenant,
  locale,
  social,
}: {
  tenant: ActiveStorefrontTenant;
  locale: Locale;
  social: Partial<Record<SocialNetwork, string>>;
}) {
  const t = await getTranslations("store.footer");
  const address = formatAddress(tenant.address);
  const tagline = pickLocalized(tenant.tagline, locale, tenant.default_language);
  const year = new Date().getFullYear();
  const networks = SOCIAL_NETWORKS.filter((n) => social[n]);

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-2">
          <p className="font-display text-2xl font-semibold">{tenant.business_name}</p>
          {tagline ? <p className="max-w-sm text-sm text-muted">{tagline}</p> : null}
        </div>
        <address className="space-y-2 text-sm not-italic">
          <p className="mb-3 font-medium">{t("contact")}</p>
          {address ? (
            <p className="text-muted">
              <span className="sr-only">{t("address")}: </span>
              {address}
            </p>
          ) : null}
          {tenant.phone ? (
            <p>
              <span className="sr-only">{t("phone")}: </span>
              <a href={`tel:${tenant.phone.replace(/\s+/g, "")}`} className="text-muted hover:text-fg" dir="ltr">
                {tenant.phone}
              </a>
            </p>
          ) : null}
          {tenant.email ? (
            <p>
              <span className="sr-only">{t("email")}: </span>
              <a href={`mailto:${tenant.email}`} className="text-muted hover:text-fg">
                {tenant.email}
              </a>
            </p>
          ) : null}
        </address>
        {networks.length > 0 ? (
          <nav aria-label={t("follow")} className="text-sm">
            <p className="mb-3 font-medium">{t("follow")}</p>
            <ul className="space-y-2">
              {networks.map((n) => (
                <li key={n}>
                  <a href={social[n]} target="_blank" rel="noopener noreferrer me" className="text-muted hover:text-fg">
                    {SOCIAL_LABELS[n]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{t("rights", { year, name: tenant.business_name })}</p>
          <p>{t("poweredBy")}</p>
        </Container>
      </div>
    </footer>
  );
}
