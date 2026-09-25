"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

export function RevokeButton({
  action,
  invitationId,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invitationId: string;
}) {
  const t = useTranslations("staff");
  const [state, formAction] = useActionState(action, idleState as FormState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton variant="ghost" size="sm">
        {t("revoke")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
