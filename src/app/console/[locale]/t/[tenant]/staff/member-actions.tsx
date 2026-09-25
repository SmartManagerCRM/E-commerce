"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function MemberActions({
  action,
  userId,
  roleKey,
  status,
  roles,
  isSelf,
  name,
}: {
  action: Action;
  userId: string;
  roleKey: string;
  status: string;
  roles: { value: string; label: string }[];
  isSelf: boolean;
  name: string;
}) {
  const t = useTranslations("staff");
  const [state, formAction] = useActionState(action, idleState as FormState);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="intent" value="role" />
          <label className="sr-only" htmlFor={`role-${userId}`}>
            {t("roleFor", { name })}
          </label>
          <select
            id={`role-${userId}`}
            name="role_key"
            defaultValue={roleKey}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <SubmitButton variant="secondary" size="sm">
            {t("changeRole")}
          </SubmitButton>
        </form>
        {!isSelf ? (
          <>
            <form action={formAction}>
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="intent" value={status === "disabled" ? "enable" : "disable"} />
              <SubmitButton variant="ghost" size="sm">
                {status === "disabled" ? t("enable") : t("disable")}
              </SubmitButton>
            </form>
            <form action={formAction}>
              <input type="hidden" name="user_id" value={userId} />
              <input type="hidden" name="intent" value="remove" />
              <SubmitButton variant="ghost" size="sm" className="text-danger">
                {t("remove")}
              </SubmitButton>
            </form>
          </>
        ) : null}
      </div>
      <FormMessage state={state} />
    </div>
  );
}
