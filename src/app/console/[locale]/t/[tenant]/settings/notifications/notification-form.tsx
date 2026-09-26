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

export function NotificationSettingsForm({
  action,
  disabled,
  configured,
  values,
}: {
  action: Action;
  disabled: boolean;
  configured: boolean;
  values: { orderEmails: boolean; dailyBrief: boolean; recipientEmail: string; tenantEmail: string | null };
}) {
  const t = useTranslations("notificationSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        {!configured ? (
          <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted">{t("notConfigured")}</p>
        ) : null}
        <Toggle name="order_emails" label={t("orderEmails")} hint={t("orderEmailsHint")} defaultChecked={values.orderEmails} />
        <Toggle name="daily_brief" label={t("dailyBrief")} hint={t("dailyBriefHint")} defaultChecked={values.dailyBrief} />
        <TextInput
          label={t("recipientEmail")}
          name="recipient_email"
          type="email"
          dir="ltr"
          defaultValue={values.recipientEmail}
          placeholder={values.tenantEmail ?? ""}
          hint={t("recipientEmailHint")}
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
