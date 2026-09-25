import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { BUSINESS_TYPES } from "@/lib/validation/tenant";
import { requirePlatformAdmin } from "@/server/auth/platform";
import { createUserClient } from "@/server/supabase/clients";

import { createTenant } from "../../actions";
import { CreateTenantForm } from "./create-tenant-form";

type Props = PageProps<"/console/[locale]/platform/tenants/new">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "platformAdmin.create" });
  return { title: t("title") };
}

export default async function NewTenantPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);

  const t = await getTranslations("platformAdmin");
  const supabase = await createUserClient();
  const [{ data: plans }, { data: currencies }] = await Promise.all([
    supabase.from("plans").select("key, name").eq("is_active", true).order("sort_order"),
    supabase.from("currencies").select("code, name").eq("is_active", true).order("code"),
  ]);

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/platform" className="text-sm text-muted hover:text-fg">
        ← {t("backToBusinesses")}
      </Link>
      <SectionCard title={t("create.title")} description={t("create.description")}>
        <CreateTenantForm
          action={createTenant}
          plans={(plans ?? []).map((p) => ({ value: p.key, label: pickLocalized(p.name, locale) }))}
          currencies={(currencies ?? []).map((c) => ({
            value: c.code,
            label: `${c.code} — ${pickLocalized(c.name, locale)}`,
          }))}
          businessTypes={BUSINESS_TYPES.map((b) => ({ value: b, label: t(`businessTypes.${b}`) }))}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </SectionCard>
    </main>
  );
}
