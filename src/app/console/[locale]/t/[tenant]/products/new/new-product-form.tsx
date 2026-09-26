"use client";

import { useTranslations } from "next-intl";

import { TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import { idleState, type FormState } from "@/lib/validation/common";

import { priceStep } from "../price-step";

export function NewProductForm({
  action,
  locales,
  currency,
  exponent,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locales: readonly Locale[];
  currency: string;
  exponent: number;
}) {
  const t = useTranslations("products");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-5">
      <LocalizedFields name="name" label={t("name")} locales={locales} defaultValue={{}} maxLength={160} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label={t("priceWithCurrency", { currency })}
          name="price"
          type="number"
          inputMode="decimal"
          min={0}
          step={priceStep(exponent)}
          required
          dir="ltr"
        />
        <TextInput label={t("slug")} name="slug" dir="ltr" hint={t("slugHint")} maxLength={120} />
      </div>
      <p className="text-xs text-muted">{t("newHint")}</p>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending={pending} pendingLabel={t("creating")}>
          {t("create")}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
