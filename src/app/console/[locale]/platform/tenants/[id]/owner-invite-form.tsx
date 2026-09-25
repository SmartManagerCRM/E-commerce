"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextInput } from "@/components/forms/controls";
import { CopyLink } from "@/components/forms/copy-link";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState<{ link: string }>, formData: FormData) => Promise<FormState<{ link: string }>>;

export function OwnerInviteForm({ action }: { action: Action }) {
  const t = useTranslations("platformAdmin.detail");
  const [state, formAction] = useActionState(action, idleState as FormState<{ link: string }>);
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextInput label={t("ownerEmail")} name="email" type="email" dir="ltr" required />
        </div>
        <SubmitButton variant="secondary">{t("inviteOwner")}</SubmitButton>
      </form>
      <FormMessage state={state} />
      {state.status === "success" && state.data ? <CopyLink link={state.data.link} label={t("ownerLink")} /> : null}
    </div>
  );
}
