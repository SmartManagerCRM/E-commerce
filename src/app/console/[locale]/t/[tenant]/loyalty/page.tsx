import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { isLocale } from "@/i18n/locales";
import { asLocalizedText } from "@/lib/localized";
import { minorToDecimal } from "@/lib/money";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import { getLoyaltySettings, listLoyaltyRewards, listLoyaltyTiers } from "@/server/services/loyalty";

import { deleteLoyaltyReward, deleteLoyaltyTier, saveLoyaltyReward, saveLoyaltySettings, saveLoyaltyTier } from "./actions";
import { LoyaltyRewardForm, LoyaltySettingsForm, LoyaltyTierForm } from "./loyalty-forms";
import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/loyalty">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("loyalty") };
}

export default async function LoyaltyPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="loyalty">
      <Content slug={slug} context={context} />
    </ModuleGate>
  );
}

async function Content({ slug, context }: { slug: string; context: TenantAdminContext }) {
  const t = await getTranslations("loyalty");
  const settings = await catalogSettings(context);
  const entitled = context.features.loyalty?.enabled === true;
  const canEdit = context.permissions.includes("marketing.write") && entitled;

  const [loyalty, tiers, rewards] = await Promise.all([
    getLoyaltySettings(context),
    listLoyaltyTiers(context),
    listLoyaltyRewards(context),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {!entitled ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          {t("notEntitled")}
        </p>
      ) : null}

      <SectionCard title={t("programTitle")} description={t("programDescription")}>
        <LoyaltySettingsForm
          action={saveLoyaltySettings.bind(null, slug)}
          disabled={!canEdit}
          currency={settings.currency}
          values={{ active: loyalty.active, pointsPerCurrencyUnit: loyalty.pointsPerCurrencyUnit }}
        />
      </SectionCard>

      <SectionCard title={t("tiersTitle")} description={t("tiersDescription")}>
        <div className="space-y-4">
          {tiers.map((tier) => (
            <LoyaltyTierForm
              key={tier.id}
              action={saveLoyaltyTier.bind(null, slug)}
              remove={deleteLoyaltyTier.bind(null, slug, tier.id)}
              locales={settings.locales}
              disabled={!canEdit}
              tier={{
                id: tier.id,
                name: asLocalizedText(tier.name),
                thresholdPoints: tier.thresholdPoints,
                perks: tier.perks ?? "",
                active: tier.active,
                position: tier.position,
              }}
            />
          ))}
          {tiers.length === 0 ? <p className="text-sm text-muted">{t("noTiers")}</p> : null}
          {canEdit ? (
            <LoyaltyTierForm
              key="new-tier"
              action={saveLoyaltyTier.bind(null, slug)}
              locales={settings.locales}
              disabled={false}
              tier={null}
              position={tiers.length}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t("rewardsTitle")} description={t("rewardsDescription")}>
        <div className="space-y-4">
          {rewards.map((reward) => (
            <LoyaltyRewardForm
              key={reward.id}
              action={saveLoyaltyReward.bind(null, slug)}
              remove={deleteLoyaltyReward.bind(null, slug, reward.id)}
              locales={settings.locales}
              currency={settings.currency}
              disabled={!canEdit}
              reward={{
                id: reward.id,
                name: asLocalizedText(reward.name),
                costPoints: reward.costPoints,
                kind: reward.kind,
                value:
                  reward.kind === "discount_fixed"
                    ? minorToDecimal(BigInt(reward.value), settings.exponent)
                    : String(reward.value),
                active: reward.active,
                position: reward.position,
              }}
            />
          ))}
          {rewards.length === 0 ? <p className="text-sm text-muted">{t("noRewards")}</p> : null}
          {canEdit ? (
            <LoyaltyRewardForm
              key="new-reward"
              action={saveLoyaltyReward.bind(null, slug)}
              locales={settings.locales}
              currency={settings.currency}
              disabled={false}
              reward={null}
              position={rewards.length}
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
