"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { OrderStatus } from "@/lib/commerce/orders";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Buttons for the allowed next statuses; cancelling asks for confirmation and an optional reason. */
export function StatusActions({ action, next }: { action: Action; next: OrderStatus[] }) {
  const t = useTranslations("orders");
  const tStatus = useTranslations("orderStatus");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  const [cancelling, setCancelling] = useState(false);
  const forward = next.filter((s) => s !== "cancelled");

  return (
    <div className="space-y-3">
      {!cancelling ? (
        <form {...formProps} className="flex flex-wrap gap-2">
          {forward.map((status, i) => (
            <SubmitButton
              key={status}
              name="status"
              value={status}
              pending={pending}
              variant={i === 0 ? "primary" : "secondary"}
              size="sm"
            >
              {t(`actions.${status as "confirmed"}`)}
            </SubmitButton>
          ))}
          {next.includes("cancelled") ? (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-danger hover:bg-danger/5"
            >
              {t("cancelOrder")}
            </button>
          ) : null}
        </form>
      ) : (
        <form {...formProps} className="space-y-3">
          <input type="hidden" name="status" value="cancelled" />
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t("cancelReason")}</span>
            <input
              name="note"
              maxLength={500}
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
            />
            <span className="block text-xs text-muted">{t("cancelHint")}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} size="sm" className="bg-danger text-white hover:opacity-90">
              {t("confirmCancel")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setCancelling(false)}
              className="h-9 px-3 text-sm text-muted hover:text-fg"
            >
              {t("keepOrder")}
            </button>
          </div>
        </form>
      )}
      <FormMessage state={state} />
      <p className="sr-only" aria-live="polite">
        {state.status === "success" ? tStatus("updated") : ""}
      </p>
    </div>
  );
}

export function PaymentForm({ action, total }: { action: Action; total: string }) {
  const t = useTranslations("orders");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-3">
      <p className="text-sm text-muted">{t("collectHint", { total })}</p>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t("method")}</span>
        <select
          name="method"
          defaultValue="cash"
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
        >
          {(["cash", "card_terminal", "bank_transfer"] as const).map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending={pending} variant="secondary" size="sm">
        {t("markPaid")}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
