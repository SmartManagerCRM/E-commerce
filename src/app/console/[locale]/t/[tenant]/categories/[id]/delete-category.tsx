"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { idleState, type FormState } from "@/lib/validation/common";

export function DeleteCategory({ action, name }: { action: (state: FormState) => Promise<FormState>; name: string }) {
  const t = useTranslations("categories");
  const [confirming, setConfirming] = useState(false);
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("deleteHint")}</p>
      {confirming ? (
        <form {...formProps} className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium" role="alert">
            {t("deleteConfirm", { name })}
          </p>
          <SubmitButton pending={pending} className="bg-danger text-white hover:opacity-90">
            {t("deleteYes")}
          </SubmitButton>
          <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted hover:text-fg">
            {t("cancel")}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-9 items-center rounded-md border border-danger/40 px-3 text-sm text-danger hover:bg-danger/5"
        >
          {t("delete")}
        </button>
      )}
      <FormMessage state={state} />
    </div>
  );
}
