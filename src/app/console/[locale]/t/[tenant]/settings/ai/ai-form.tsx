"use client";

import { useTranslations } from "next-intl";

import { Select, TextArea, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { AI_TONES } from "@/lib/validation/ai";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AISettingsForm({
  action,
  disabled,
  values,
}: {
  action: Action;
  disabled: boolean;
  values: { active: boolean; assistantName: string; greeting: string; tone: (typeof AI_TONES)[number] };
}) {
  const t = useTranslations("settingsAI");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values.active}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="font-medium">{t("active")}</span>
            <span className="mt-0.5 block text-xs text-muted">{t("activeHint")}</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label={t("assistantName")} name="assistant_name" maxLength={40} defaultValue={values.assistantName} required />
          <Select
            label={t("tone")}
            name="tone"
            defaultValue={values.tone}
            options={AI_TONES.map((tone) => ({ value: tone, label: t(`tones.${tone}`) }))}
          />
        </div>
        <TextArea label={t("greeting")} name="greeting" maxLength={300} rows={2} defaultValue={values.greeting} hint={t("greetingHint")} />
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
