"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { MANUAL_STOCK_REASONS } from "@/lib/validation/catalog";
import { idleState, type FormState } from "@/lib/validation/common";

import { priceStep } from "../../products/price-step";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AdjustForm({ action, itemId }: { action: Action; itemId: string }) {
  const t = useTranslations("inventory");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label={t("direction")}
          name="direction"
          defaultValue="add"
          options={[
            { value: "add", label: t("add") },
            { value: "remove", label: t("remove") },
          ]}
        />
        <TextInput label={t("quantity")} name="quantity" type="number" min={1} step={1} required dir="ltr" />
        <Select
          label={t("reason")}
          name="reason"
          defaultValue="restock"
          options={MANUAL_STOCK_REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
        />
      </div>
      <TextInput label={t("note")} name="note" maxLength={500} hint={t("noteHint")} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending={pending} pendingLabel={tf("saving")}>
          {t("applyAdjustment")}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SettingsForm({
  action,
  itemId,
  disabled,
  currency,
  exponent,
  values,
}: {
  action: Action;
  itemId: string;
  disabled: boolean;
  currency: string;
  exponent: number;
  values: { minStock: number; trackStock: boolean; allowBackorder: boolean; cost: string };
}) {
  const t = useTranslations("inventory");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("minStock")}
            name="min_stock"
            type="number"
            min={0}
            step={1}
            defaultValue={String(values.minStock)}
            hint={t("minStockHint")}
            dir="ltr"
          />
          <TextInput
            label={t("cost", { currency })}
            name="cost"
            type="number"
            min={0}
            step={priceStep(exponent)}
            defaultValue={values.cost}
            hint={t("costHint")}
            dir="ltr"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="track_stock"
            defaultChecked={values.trackStock}
            className="size-4 accent-primary"
          />
          {t("trackStock")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allow_backorder"
            defaultChecked={values.allowBackorder}
            className="size-4 accent-primary"
          />
          {t("allowBackorder")}
        </label>
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
