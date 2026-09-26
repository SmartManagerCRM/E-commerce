"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { DAYS, type Day, type OpeningHours } from "@/lib/storefront/hours";
import { idleState, type FormState } from "@/lib/validation/common";
import { useActionForm } from "@/components/forms/use-action-form";

type Status = "open" | "closed" | "unset";

export function HoursForm({
  action,
  hours,
  canEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  hours: OpeningHours;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.hours");
  const tf = useTranslations("forms");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  const [status, setStatus] = useState<Record<Day, Status>>(
    () =>
      Object.fromEntries(
        DAYS.map((d) => [d, hours[d] === undefined ? "unset" : hours[d]!.length === 0 ? "closed" : "open"]),
      ) as Record<Day, Status>,
  );

  return (
    <form {...formActionProps} className="space-y-5">
      <fieldset disabled={!canEdit}>
        <legend className="sr-only">{t("title")}</legend>
        <div className="divide-y divide-border rounded-md border border-border">
          {DAYS.map((day) => (
            <div
              key={day}
              className="grid grid-cols-[6rem_1fr] items-center gap-3 px-3 py-2 sm:grid-cols-[8rem_9rem_1fr]"
            >
              <span className="text-sm font-medium">{t(`days.${day}`)}</span>
              <label className="sr-only" htmlFor={`${day}-status`}>
                {t("statusFor", { day: t(`days.${day}`) })}
              </label>
              <select
                id={`${day}-status`}
                name={`${day}.status`}
                value={status[day]}
                onChange={(e) => setStatus((s) => ({ ...s, [day]: e.target.value as Status }))}
                className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="open">{t("open")}</option>
                <option value="closed">{t("closed")}</option>
                <option value="unset">{t("unset")}</option>
              </select>
              {status[day] === "open" ? (
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1" dir="ltr">
                  <label className="sr-only" htmlFor={`${day}-open`}>
                    {t("opensAt", { day: t(`days.${day}`) })}
                  </label>
                  <input
                    id={`${day}-open`}
                    type="time"
                    name={`${day}.open`}
                    defaultValue={hours[day]?.[0]?.open ?? "09:00"}
                    required
                    className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                  />
                  <span aria-hidden="true">–</span>
                  <label className="sr-only" htmlFor={`${day}-close`}>
                    {t("closesAt", { day: t(`days.${day}`) })}
                  </label>
                  <input
                    id={`${day}-close`}
                    type="time"
                    name={`${day}.close`}
                    defaultValue={hours[day]?.[0]?.close ?? "22:00"}
                    required
                    className="h-10 rounded-md border border-border bg-surface px-2 text-sm"
                  />
                </div>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t("hint")}</p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        {canEdit ? (
          <SubmitButton pending={statePending} pendingLabel={tf("saving")}>
            {tf("save")}
          </SubmitButton>
        ) : null}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
