import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { formatAddress } from "@/lib/address";
import type { ActiveStorefrontTenant } from "@/lib/tenant";

export async function StoreFooter({ tenant }: { tenant: ActiveStorefrontTenant }) {
  const t = await getTranslations("store.footer");
  const address = formatAddress(tenant.address);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="font-display text-xl font-semibold">{tenant.business_name}</p>
          {tenant.city ? <p className="text-sm text-muted">{tenant.city}</p> : null}
        </div>
        <address className="space-y-3 text-sm not-italic">
          <p className="font-medium">{t("contact")}</p>
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
