"use client";

import { useTranslations } from "next-intl";

import { TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";
import { useActionForm } from "@/components/forms/use-action-form";

export function AcceptForm({ action }: { action: () => Promise<FormState> }) {
  const t = useTranslations("invite");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  return (
    <form {...formActionProps} className="space-y-3">
      <SubmitButton pending={statePending} className="w-full">
        {t("accept")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function SignupForm({
  action,
  email,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  email: string;
}) {
  const t = useTranslations("invite");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  return (
    <form {...formActionProps} className="space-y-4" noValidate>
      <TextInput label={t("email")} value={email} readOnly disabled dir="ltr" />
      <TextInput label={t("fullName")} name="full_name" autoComplete="name" required maxLength={120} />
      <TextInput
        label={t("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        dir="ltr"
        hint={t("passwordHint")}
      />
      <TextInput
        label={t("passwordConfirm")}
        name="password_confirm"
        type="password"
        autoComplete="new-password"
        required
        dir="ltr"
      />
      <FormMessage state={state} />
      <SubmitButton pending={statePending} className="w-full">
        {t("createAccount")}
      </SubmitButton>
    </form>
  );
}
