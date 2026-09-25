import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/locales";
import { asLocalizedText } from "@/lib/localized";
import { requireTenantAdmin } from "@/server/admin/context";
import { verificationRecord } from "@/server/domains/verification";
import { serverEnv } from "@/server/env";
import { createUserClient } from "@/server/supabase/clients";

import {
  addCustomDomain,
  removeCustomDomain,
  setPrimaryDomain,
  updateBusinessProfile,
  verifyCustomDomain,
} from "./actions";
import { DomainsSection } from "./domains-section";
import { ProfileForm } from "./profile-form";
import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("settings") };
}

export default async function SettingsPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);

  return (
    <ModuleGate context={context} moduleKey="settings">
      <SettingsContent slug={slug} context={context} />
    </ModuleGate>
  );
}

async function SettingsContent({
  slug,
  context,
}: {
  slug: string;
  context: Awaited<ReturnType<typeof requireTenantAdmin>>;
}) {
  const t = await getTranslations("settings");
  const supabase = await createUserClient();
  const [{ data: tenant, error }, { data: domains }] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "business_name, tagline, description, phone, email, address, city, country, timezone, currency, default_language, enabled_languages",
      )
      .eq("id", context.tenant.id)
      .single(),
    supabase
      .from("tenant_domains")
      .select("id, hostname, is_primary, verified_at, hosting_connected_at, verification_token, last_check_error")
      .eq("tenant_id", context.tenant.id)
      .order("created_at"),
  ]);
  if (error || !tenant) throw new Error("Failed to load settings");

  const env = serverEnv();
  const canEdit = context.permissions.includes("settings.write");
  const address = Object.fromEntries(
    Object.entries((tenant.address ?? {}) as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <SectionCard title={t("profile.title")} description={t("profile.description")}>
        <ProfileForm
          action={updateBusinessProfile.bind(null, slug)}
          canEdit={canEdit}
          timezones={Intl.supportedValuesOf("timeZone")}
          defaults={{
            business_name: tenant.business_name,
            tagline: asLocalizedText(tenant.tagline),
            description: asLocalizedText(tenant.description),
            phone: tenant.phone ?? "",
            email: tenant.email ?? "",
            address,
            city: tenant.city ?? "",
            country: tenant.country ?? "",
            timezone: tenant.timezone,
            currency: tenant.currency,
            default_language: tenant.default_language as Locale,
            enabled_languages: tenant.enabled_languages as Locale[],
          }}
        />
      </SectionCard>

      <SectionCard title={t("domains.title")} description={t("domains.description")}>
        <DomainsSection
          platformHost={`${slug}.${env.PLATFORM_ROOT_DOMAIN}`}
          dnsTarget={env.STOREFRONT_DNS_TARGET ?? null}
          entitled={context.features.custom_domain?.enabled === true}
          canEdit={canEdit}
          domains={(domains ?? []).map((d) => ({
            id: d.id,
            hostname: d.hostname,
            isPrimary: d.is_primary,
            verified: d.verified_at !== null,
            connected: d.hosting_connected_at !== null,
            lastCheckError: d.last_check_error,
            record: verificationRecord(d.hostname, d.verification_token),
          }))}
          actions={{
            add: addCustomDomain.bind(null, slug),
            verify: verifyCustomDomain.bind(null, slug),
            primary: setPrimaryDomain.bind(null, slug),
            remove: removeCustomDomain.bind(null, slug),
          }}
        />
      </SectionCard>
    </div>
  );
}
