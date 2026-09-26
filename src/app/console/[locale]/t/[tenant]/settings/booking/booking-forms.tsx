"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { BookingResourceKind } from "@/lib/booking";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const KINDS: BookingResourceKind[] = ["table", "area", "staff", "room"];

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function BookingSettingsForm({
  action,
  disabled,
  values,
}: {
  action: Action;
  disabled: boolean;
  values: {
    acceptingBookings: boolean;
    defaultDurationMinutes: number;
    bufferMinutes: number;
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    maxPartySize: number | null;
  };
}) {
  const t = useTranslations("bookingSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <Toggle
          name="accepting_bookings"
          label={t("acceptingBookings")}
          hint={t("acceptingBookingsHint")}
          defaultChecked={values.acceptingBookings}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("defaultDuration")}
            name="default_duration_minutes"
            type="number"
            min={15}
            max={480}
            defaultValue={values.defaultDurationMinutes}
            dir="ltr"
          />
          <TextInput
            label={t("bufferMinutes")}
            name="buffer_minutes"
            type="number"
            min={0}
            max={120}
            defaultValue={values.bufferMinutes}
            dir="ltr"
          />
          <TextInput
            label={t("minNotice")}
            name="min_notice_minutes"
            type="number"
            min={0}
            max={10080}
            defaultValue={values.minNoticeMinutes}
            dir="ltr"
          />
          <TextInput
            label={t("maxAdvance")}
            name="max_advance_days"
            type="number"
            min={1}
            max={365}
            defaultValue={values.maxAdvanceDays}
            dir="ltr"
          />
          <TextInput
            label={t("maxPartySize")}
            name="max_party_size"
            type="number"
            min={1}
            max={100}
            defaultValue={values.maxPartySize ?? ""}
            dir="ltr"
          />
        </div>
      </fieldset>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pending={pending} pendingLabel={tf("saving")}>
            {tf("save")}
          </SubmitButton>
          <FormMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}

type ResourceValues = {
  id: string;
  name: LocalizedText;
  kind: BookingResourceKind;
  capacityMin: string;
  capacityMax: string;
  active: boolean;
  position: number;
};

export function BookingResourceForm({
  action,
  remove,
  locales,
  disabled,
  resource,
  position,
}: {
  action: Action;
  remove?: (state: FormState) => Promise<FormState>;
  locales: readonly Locale[];
  disabled: boolean;
  resource: ResourceValues | null;
  position?: number;
}) {
  const t = useTranslations("bookingSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  const removal = useActionForm(remove ?? (async () => idleState as FormState), idleState as FormState);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!resource && state.status === "success") form.current?.reset();
  }, [state, resource]);
  return (
    <div className="rounded-md border border-border p-4">
      <form ref={form} {...formProps} className="space-y-4">
        <p className="text-sm font-semibold">{resource ? t("resource") : t("newResource")}</p>
        {resource ? <input type="hidden" name="id" value={resource.id} /> : null}
        <input type="hidden" name="position" value={resource?.position ?? position ?? 0} />
        <fieldset disabled={disabled} className="space-y-4">
          <LocalizedFields
            name="name"
            label={t("resourceName")}
            locales={locales}
            defaultValue={resource?.name ?? {}}
            maxLength={60}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label={t("kind")}
              name="kind"
              defaultValue={resource?.kind ?? "table"}
              options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
            />
            <TextInput
              label={t("capacityMin")}
              name="capacity_min"
              type="number"
              min={1}
              max={100}
              defaultValue={resource?.capacityMin ?? ""}
              dir="ltr"
            />
            <TextInput
              label={t("capacityMax")}
              name="capacity_max"
              type="number"
              min={1}
              max={100}
              defaultValue={resource?.capacityMax ?? ""}
              dir="ltr"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={resource?.active ?? true}
              className="size-4 accent-primary"
            />
            {t("resourceActive")}
          </label>
        </fieldset>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={pending} pendingLabel={tf("saving")} variant={resource ? "secondary" : "primary"} size="sm">
              {resource ? tf("save") : t("addResource")}
            </SubmitButton>
            <FormMessage state={state} />
          </div>
        ) : null}
      </form>
      {resource && remove && !disabled ? (
        <form {...removal.formProps} className="mt-3 border-t border-border pt-3">
          <button type="submit" disabled={removal.pending} className="text-sm text-danger hover:underline">
            {t("deleteResource")}
          </button>
          <FormMessage state={removal.state} />
        </form>
      ) : null}
    </div>
  );
}
