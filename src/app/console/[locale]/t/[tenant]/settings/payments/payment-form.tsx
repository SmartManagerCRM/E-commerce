"use client";

import { useTranslations } from "next-intl";

import { TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
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

export function PaymentProviderForm({
  action,
  disabled,
  configured,
  values,
}: {
  action: Action;
  disabled: boolean;
  configured: boolean;
  values: {
    mode: "test" | "live";
    publishableKey: string;
    methodCard: boolean;
    methodMada: boolean;
    methodStcpay: boolean;
    isActive: boolean;
  };
}) {
  const t = useTranslations("paymentSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        {configured ? (
          <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{t("configured")}</p>
        ) : (
          <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted">{t("notConfiguredYet")}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="mode" className="block text-sm font-medium">
            {t("mode")}
          </label>
          <select
            id="mode"
            name="mode"
            defaultValue={values.mode}
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
          >
            <option value="test">{t("modeTest")}</option>
            <option value="live">{t("modeLive")}</option>
          </select>
          <p className="text-xs text-muted">{t("modeHint")}</p>
        </div>

        <TextInput
          label={t("publishableKey")}
          name="publishable_key"
          defaultValue={values.publishableKey}
          required
          maxLength={200}
          dir="ltr"
        />
        <TextInput
          label={t("secretKey")}
          name="secret_key"
          type="password"
          autoComplete="off"
          placeholder={configured ? t("keepCurrent") : ""}
          maxLength={200}
          hint={t("secretKeyHint")}
          dir="ltr"
        />
        <TextInput
          label={t("webhookSecret")}
          name="webhook_secret"
          type="password"
          autoComplete="off"
          placeholder={configured ? t("keepCurrent") : ""}
          maxLength={200}
          hint={t("webhookSecretHint")}
          dir="ltr"
        />

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{t("methodsTitle")}</legend>
          <Toggle name="method_card" label={t("methodCard")} defaultChecked={values.methodCard} />
          <Toggle name="method_mada" label={t("methodMada")} defaultChecked={values.methodMada} />
          <Toggle name="method_stcpay" label={t("methodStcpay")} defaultChecked={values.methodStcpay} />
        </fieldset>

        <Toggle name="is_active" label={t("isActive")} hint={t("isActiveHint")} defaultChecked={values.isActive} />
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
