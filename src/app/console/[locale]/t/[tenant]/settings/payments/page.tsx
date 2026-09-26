import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { commerceConfigured } from "@/server/commerce/storefront";
import { createUserClient } from "@/server/supabase/clients";

import { savePaymentProvider } from "./actions";
import { PaymentProviderForm } from "./payment-form";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings/payments">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "paymentSettings" });
  return { title: t("title") };
}

export default async function PaymentSettingsPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="settings">
      <Content slug={slug} context={context} />
    </ModuleGate>
  );
}

async function Content({ slug, context }: { slug: string; context: TenantAdminContext }) {
  const t = await getTranslations("paymentSettings");
  const canEdit = context.permissions.includes("settings.write");
  const supabase = await createUserClient();
  const { data: config } = await supabase
    .from("payment_provider_configs")
    .select("mode, public_config, methods, is_active, secret_vault_id, webhook_secret_vault_id")
    .eq("tenant_id", context.tenant.id)
    .eq("provider", "moyasar")
    .maybeSingle();
  const publicConfig = (config?.public_config ?? {}) as Record<string, unknown>;
  const methods = new Set((config?.methods as string[] | null) ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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

      <SectionCard title={t("moyasarTitle")} description={t("moyasarDescription")}>
        <PaymentProviderForm
          action={savePaymentProvider.bind(null, slug)}
          disabled={!canEdit}
          configured={Boolean(config?.secret_vault_id && config?.webhook_secret_vault_id)}
          values={{
            mode: (config?.mode as "test" | "live" | undefined) ?? "test",
            publishableKey: typeof publicConfig.publishable_key === "string" ? publicConfig.publishable_key : "",
            methodCard: methods.has("creditcard"),
            methodMada: methods.has("mada"),
            methodStcpay: methods.has("stcpay"),
            isActive: config?.is_active === true,
          }}
        />
      </SectionCard>
    </div>
  );
}
