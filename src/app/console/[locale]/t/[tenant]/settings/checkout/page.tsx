import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { asLocalizedText } from "@/lib/localized";
import { minorToDecimal } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { commerceConfigured } from "@/server/commerce/storefront";
import { createUserClient } from "@/server/supabase/clients";

import { deleteZone, saveCommerceSettings, saveZone } from "./actions";
import { CommerceSettingsForm, ZoneForm } from "./checkout-forms";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings/checkout">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "checkoutSettings" });
  return { title: t("title") };
}

export default async function CheckoutSettingsPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="settings">
      <Content slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function Content({ slug, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("checkoutSettings");
  const settings = await catalogSettings(context);
  const supabase = await createUserClient();
  const [{ data: row }, { data: zones }] = await Promise.all([
    supabase.from("tenant_settings").select("checkout, tax").eq("tenant_id", context.tenant.id).single(),
    supabase
      .from("delivery_zones")
      .select("*")
      .eq("tenant_id", context.tenant.id)
      .order("position")
      .order("created_at"),
  ]);
  const checkout = (row?.checkout ?? {}) as Record<string, unknown>;
  const tax = (row?.tax ?? {}) as Record<string, unknown>;
  const canEdit = context.permissions.includes("settings.write");
  const hasDelivery = context.features.delivery?.enabled === true;
  const decimal = (minor: unknown) =>
    typeof minor === "number" ? minorToDecimal(BigInt(minor), settings.exponent) : "";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href={`/t/${slug}/settings`} className="text-sm text-muted hover:text-fg">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {!commerceConfigured() ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {t("notConfigured")}
        </p>
      ) : null}

      <SectionCard title={t("orderingTitle")} description={t("orderingDescription")}>
        <CommerceSettingsForm
          action={saveCommerceSettings.bind(null, slug)}
          disabled={!canEdit}
          hasDelivery={hasDelivery}
          currency={settings.currency}
          exponent={settings.exponent}
          values={{
            acceptingOrders: checkout.accepting_orders === true,
            pickup: checkout.pickup !== false,
            delivery: checkout.delivery === true,
            payOnFulfillment: checkout.pay_on_fulfillment !== false,
            minOrder: decimal(checkout.min_order_minor),
            taxRate: typeof tax.rate_bps === "number" ? String(tax.rate_bps / 100) : "0",
            taxIncluded: tax.included !== false,
            taxRegistrationNumber: typeof tax.registration_number === "string" ? tax.registration_number : "",
          }}
        />
      </SectionCard>

      <SectionCard title={t("zonesTitle")} description={hasDelivery ? t("zonesDescription") : t("zonesNotEntitled")}>
        <div className="space-y-4">
          {(zones ?? []).map((zone) => (
            <ZoneForm
              key={zone.id}
              action={saveZone.bind(null, slug)}
              remove={deleteZone.bind(null, slug, zone.id)}
              locales={settings.locales}
              currency={settings.currency}
              exponent={settings.exponent}
              disabled={!canEdit}
              zone={{
                id: zone.id,
                name: asLocalizedText(zone.name),
                fee: decimal(zone.fee_minor),
                minOrder: decimal(zone.min_order_minor),
                freeOver: decimal(zone.free_over_minor),
                eta: zone.eta_minutes === null ? "" : String(zone.eta_minutes),
                active: zone.active,
                position: zone.position,
              }}
            />
          ))}
          {(zones ?? []).length === 0 ? <p className="text-sm text-muted">{t("noZones")}</p> : null}
          {canEdit ? (
            <ZoneForm
              key="new-zone"
              action={saveZone.bind(null, slug)}
              locales={settings.locales}
              currency={settings.currency}
              exponent={settings.exponent}
              disabled={false}
              zone={null}
              position={(zones ?? []).length}
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
