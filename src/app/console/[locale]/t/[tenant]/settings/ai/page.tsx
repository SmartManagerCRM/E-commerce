import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { getAISettings, getAIUsageSummary, aiProviderConfigured } from "@/server/services/ai";

import { saveAISettings } from "./actions";
import { AISettingsForm } from "./ai-form";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings/ai">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "settingsAI" });
  return { title: t("title") };
}

export default async function AISettingsPage({ params }: Props) {
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
  const t = await getTranslations("settingsAI");
  const entitled = context.features.ai_assistant?.enabled === true;
  const canEdit = context.permissions.includes("settings.write") && entitled;

  const [settings, usage] = await Promise.all([getAISettings(context), getAIUsageSummary(context)]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href={`/t/${slug}/settings`} className="text-sm text-muted hover:text-fg">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {!entitled ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          {t("notEntitled")}
        </p>
      ) : !aiProviderConfigured() ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {t("notConfigured")}
        </p>
      ) : null}

      <SectionCard title={t("assistantTitle")} description={t("assistantDescription")}>
        <AISettingsForm
          action={saveAISettings.bind(null, slug)}
          disabled={!canEdit}
          values={{
            active: settings.active,
            assistantName: settings.assistantName,
            greeting: settings.greeting ?? "",
            tone: settings.tone,
          }}
        />
      </SectionCard>

      <SectionCard title={t("usageTitle")} description={t("usageDescription")}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{t("requests")}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{usage.requests}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{t("tokens")}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{(usage.inputTokens + usage.outputTokens).toLocaleString()}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{t("creditLimit")}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{usage.monthlyCreditLimit ?? t("unlimited")}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
