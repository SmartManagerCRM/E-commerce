"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState) => Promise<FormState>;

export function CancelBookingButton({ action }: { action: Action }) {
  const t = useTranslations("bookingTracking");
  const [confirming, setConfirming] = useState(false);
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  if (state.status === "success") {
    return <p className="text-sm text-muted">{t("cancelled")}</p>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-danger hover:underline"
      >
        {t("cancel")}
      </button>
    );
  }

  return (
    <form {...formProps} className="space-y-2">
      <p className="text-sm">{t("cancelConfirm")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel={t("cancelling")} className="bg-danger text-white hover:opacity-90">
          {t("cancel")}
        </SubmitButton>
        <button type="button" onClick={() => setConfirming(false)} className="text-sm text-muted hover:text-fg">
          {t("keepBooking")}
        </button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {t("cancelError")}
        </p>
      ) : null}
    </form>
  );
}
