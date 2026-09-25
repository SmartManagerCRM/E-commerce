"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { CopyLink } from "@/components/forms/copy-link";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

type Props = {
  action: (state: FormState<{ link: string }>, formData: FormData) => Promise<FormState<{ link: string }>>;
  roles: { value: string; label: string }[];
};

export function InviteForm({ action, roles }: Props) {
  const t = useTranslations("staff");
  const [state, formAction] = useActionState(action, idleState as FormState<{ link: string }>);
  const link = state.status === "success" ? state.data?.link : undefined;

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <TextInput label={t("email")} name="email" type="email" dir="ltr" required autoComplete="off" />
        <Select label={t("role")} name="role_key" defaultValue="staff" options={roles} />
        <SubmitButton>{t("invite")}</SubmitButton>
      </form>
      <FormMessage state={state} />
      {link ? (
        <div className="space-y-2 rounded-md border border-border bg-bg p-3">
          <p className="text-sm">{t("shareLink")}</p>
          <CopyLink link={link} label={t("inviteLink")} />
          <p className="text-xs text-muted">{t("linkExpires")}</p>
        </div>
      ) : null}
    </div>
  );
}
