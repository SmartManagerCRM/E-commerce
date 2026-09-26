"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type RedeemData = { name: unknown; kind: string; value: number };
type RedeemAction = (state: FormState<RedeemData>, formData: FormData) => Promise<FormState<RedeemData>>;

export function AdjustPointsForm({ action }: { action: Action }) {
  const t = useTranslations("customers.loyalty");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-3">
      <p className="text-sm font-semibold">{t("adjustTitle")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={t("adjustDelta")} name="delta" type="number" required dir="ltr" />
        <TextInput label={t("adjustNote")} name="note" maxLength={300} />
      </div>
      <SubmitButton pending={pending} pendingLabel={tf("saving")} variant="secondary" size="sm">
        {t("adjustSubmit")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RedeemRewardForm({
  action,
  locale,
  defaultLocale,
  rewards,
}: {
  action: RedeemAction;
  locale: Locale;
  defaultLocale: Locale;
  rewards: { id: string; name: unknown; costPoints: number }[];
}) {
  const t = useTranslations("customers.loyalty");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState<RedeemData>);

  if (rewards.length === 0) {
    return <p className="text-sm text-muted">{t("noRewardsToRedeem")}</p>;
  }

  return (
    <form {...formProps} className="space-y-3">
      <p className="text-sm font-semibold">{t("redeemTitle")}</p>
      <Select
        label={t("redeemSelect")}
        name="reward_id"
        options={rewards.map((r) => ({
          value: r.id,
          label: `${pickLocalized(r.name, locale, defaultLocale)} — ${r.costPoints}`,
        }))}
      />
      <SubmitButton pending={pending} pendingLabel={tf("saving")} variant="secondary" size="sm">
        {t("redeemSubmit")}
      </SubmitButton>
      {state.status === "success" && state.data ? (
        <p role="status" className="text-sm text-success">
          {t("redeemed", { name: pickLocalized(state.data.name, locale, defaultLocale) })}
        </p>
      ) : (
        <FormMessage state={state} />
      )}
    </form>
  );
}
