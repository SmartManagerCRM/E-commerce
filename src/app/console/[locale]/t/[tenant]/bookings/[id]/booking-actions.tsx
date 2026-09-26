"use client";

import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { BookingStatus } from "@/lib/booking";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Buttons for the allowed next statuses; the database enforces the transition table. */
export function BookingStatusActions({ action, next }: { action: Action; next: BookingStatus[] }) {
  const t = useTranslations("bookings");
  const tStatus = useTranslations("bookingStatus");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  return (
    <div className="space-y-3">
      <form {...formProps} className="flex flex-wrap gap-2">
        {next.map((status, i) => (
          <SubmitButton
            key={status}
            name="status"
            value={status}
            pending={pending}
            variant={status === "cancelled" || status === "rejected" ? "secondary" : i === 0 ? "primary" : "secondary"}
            size="sm"
            className={status === "cancelled" || status === "rejected" ? "text-danger hover:bg-danger/5" : undefined}
          >
            {t(`actions.${status as "confirmed"}`)}
          </SubmitButton>
        ))}
      </form>
      <FormMessage state={state} />
      <p className="sr-only" aria-live="polite">
        {state.status === "success" ? tStatus("updated") : ""}
      </p>
    </div>
  );
}
