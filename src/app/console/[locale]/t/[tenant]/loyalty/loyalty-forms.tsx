"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Select, TextArea, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { LoyaltyRewardKind } from "@/lib/loyalty";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function LoyaltySettingsForm({
  action,
  disabled,
  currency,
  values,
}: {
  action: Action;
  disabled: boolean;
  currency: string;
  values: { active: boolean; pointsPerCurrencyUnit: number };
}) {
  const t = useTranslations("loyalty");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <Toggle name="active" label={t("active")} hint={t("activeHint")} defaultChecked={values.active} />
        <TextInput
          label={t("pointsRate", { currency })}
          name="points_per_currency_unit"
          type="number"
          min={0}
          max={1000}
          step="0.01"
          defaultValue={values.pointsPerCurrencyUnit}
          hint={t("pointsRateHint", { currency })}
          dir="ltr"
        />
      </fieldset>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pending={pending} pendingLabel={tf("saving")}>
            {tf("save")}
          </SubmitButton>
          <FormMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}

type TierValues = {
  id: string;
  name: LocalizedText;
  thresholdPoints: number;
  perks: string;
  active: boolean;
  position: number;
};

export function LoyaltyTierForm({
  action,
  remove,
  locales,
  disabled,
  tier,
  position,
}: {
  action: Action;
  remove?: (state: FormState) => Promise<FormState>;
  locales: readonly Locale[];
  disabled: boolean;
  tier: TierValues | null;
  position?: number;
}) {
  const t = useTranslations("loyalty");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  const removal = useActionForm(remove ?? (async () => idleState as FormState), idleState as FormState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!tier && state.status === "success") form.current?.reset();
  }, [state, tier]);
  return (
    <div className="rounded-md border border-border p-4">
      <form ref={form} {...formProps} className="space-y-4">
        <p className="text-sm font-semibold">{tier ? t("tier") : t("newTier")}</p>
        {tier ? <input type="hidden" name="id" value={tier.id} /> : null}
        <input type="hidden" name="position" value={tier?.position ?? position ?? 0} />
        <fieldset disabled={disabled} className="space-y-4">
          <LocalizedFields name="name" label={t("tierName")} locales={locales} defaultValue={tier?.name ?? {}} maxLength={60} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t("threshold")}
              name="threshold_points"
              type="number"
              min={0}
              max={1000000}
              required
              defaultValue={tier?.thresholdPoints ?? 0}
              dir="ltr"
            />
          </div>
          <TextArea label={t("perks")} name="perks" maxLength={300} rows={2} defaultValue={tier?.perks ?? ""} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={tier?.active ?? true} className="size-4 accent-primary" />
            {t("tierActive")}
          </label>
        </fieldset>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending} pendingLabel={tf("saving")} variant={tier ? "secondary" : "primary"} size="sm">
              {tier ? tf("save") : t("addTier")}
            </SubmitButton>
            <FormMessage state={state} />
          </div>
        ) : null}
      </form>
      {tier && remove && !disabled ? (
        <form {...removal.formProps} className="mt-3 border-t border-border pt-3">
          <button type="submit" disabled={removal.pending} className="text-sm text-danger hover:underline">
            {t("deleteTier")}
          </button>
          <FormMessage state={removal.state} />
        </form>
      ) : null}
    </div>
  );
}

type RewardValues = {
  id: string;
  name: LocalizedText;
  costPoints: number;
  kind: LoyaltyRewardKind;
  value: string;
  active: boolean;
  position: number;
};

export function LoyaltyRewardForm({
  action,
  remove,
  locales,
  currency,
  disabled,
  reward,
  position,
}: {
  action: Action;
  remove?: (state: FormState) => Promise<FormState>;
  locales: readonly Locale[];
  currency: string;
  disabled: boolean;
  reward: RewardValues | null;
  position?: number;
}) {
  const t = useTranslations("loyalty");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  const removal = useActionForm(remove ?? (async () => idleState as FormState), idleState as FormState);
  const [kind, setKind] = useState<LoyaltyRewardKind>(reward?.kind ?? "discount_percent");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!reward && state.status === "success") form.current?.reset();
  }, [state, reward]);
  return (
    <div className="rounded-md border border-border p-4">
      <form ref={form} {...formProps} className="space-y-4">
        <p className="text-sm font-semibold">{reward ? t("reward") : t("newReward")}</p>
        {reward ? <input type="hidden" name="id" value={reward.id} /> : null}
        <input type="hidden" name="position" value={reward?.position ?? position ?? 0} />
        <fieldset disabled={disabled} className="space-y-4">
          <LocalizedFields name="name" label={t("rewardName")} locales={locales} defaultValue={reward?.name ?? {}} maxLength={60} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput
              label={t("costPoints")}
              name="cost_points"
              type="number"
              min={1}
              max={1000000}
              required
              defaultValue={reward?.costPoints ?? 100}
              dir="ltr"
            />
            <Select
              label={t("kind")}
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as LoyaltyRewardKind)}
              options={[
                { value: "discount_percent", label: t("kinds.discount_percent") },
                { value: "discount_fixed", label: t("kinds.discount_fixed") },
              ]}
            />
            <TextInput
              label={t("value")}
              name="value"
              type="number"
              min={0}
              step={kind === "discount_percent" ? "1" : "0.01"}
              max={kind === "discount_percent" ? 100 : undefined}
              required
              defaultValue={reward?.value ?? ""}
              hint={kind === "discount_percent" ? t("valuePercentHint") : t("valueFixedHint", { currency })}
              dir="ltr"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={reward?.active ?? true} className="size-4 accent-primary" />
            {t("rewardActive")}
          </label>
        </fieldset>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending} pendingLabel={tf("saving")} variant={reward ? "secondary" : "primary"} size="sm">
              {reward ? tf("save") : t("addReward")}
            </SubmitButton>
            <FormMessage state={state} />
          </div>
        ) : null}
      </form>
      {reward && remove && !disabled ? (
        <form {...removal.formProps} className="mt-3 border-t border-border pt-3">
          <button type="submit" disabled={removal.pending} className="text-sm text-danger hover:underline">
            {t("deleteReward")}
          </button>
          <FormMessage state={removal.state} />
        </form>
      ) : null}
    </div>
  );
}
