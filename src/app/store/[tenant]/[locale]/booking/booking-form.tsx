"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Select, TextArea, TextInput } from "@/components/forms/controls";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { idleState, type FormState } from "@/lib/validation/common";

import type { BookingResourceView } from "@/server/booking/storefront";

type Slot = { start: string; end: string };

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fetchSlots: (resourceId: string, date: string) => Promise<Slot[]>;
  resources: BookingResourceView[];
  maxPartySize: number | null;
  maxAdvanceDays: number;
};

function todayLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches and renders the time slots for one resource+date. The parent
 * remounts this (via a `key` of `${resourceId}:${date}`) whenever either
 * changes, so its `loading` state starts fresh from the initial render
 * rather than an effect calling `setState` synchronously on every change.
 */
function SlotPicker({
  resourceId,
  date,
  fetchSlots,
  selectedStart,
  onSelect,
}: {
  resourceId: string;
  date: string;
  fetchSlots: (resourceId: string, date: string) => Promise<Slot[]>;
  selectedStart: string;
  onSelect: (start: string) => void;
}) {
  const t = useTranslations("store.booking");
  const format = useFormatter();
  const [slots, setSlots] = useState<Slot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSlots(resourceId, date).then((result) => {
      if (!cancelled) setSlots(result);
    });
    return () => {
      cancelled = true;
    };
  }, [resourceId, date, fetchSlots]);

  if (slots === null) return <p className="text-sm text-muted">{t("loadingSlots")}</p>;
  if (slots.length === 0) return <p className="text-sm text-muted">{t("noSlots")}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {slots.map((slot) => (
        <button
          key={slot.start}
          type="button"
          onClick={() => onSelect(slot.start)}
          aria-pressed={selectedStart === slot.start}
          className={
            selectedStart === slot.start
              ? "rounded-md bg-fg px-3 py-1.5 text-sm text-bg"
              : "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-fg/5"
          }
        >
          {format.dateTime(new Date(slot.start), { timeStyle: "short" })}
        </button>
      ))}
    </div>
  );
}

export function BookingForm({ action, fetchSlots, resources, maxPartySize, maxAdvanceDays }: Props) {
  const t = useTranslations("store.booking");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [date, setDate] = useState(todayLocal());
  const [selectedStart, setSelectedStart] = useState("");

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
  const fieldError = (name: string) => {
    const code = state.status === "error" ? state.fieldErrors?.[name] : undefined;
    return code ? t(`fieldErrors.${code === "required" ? "required" : "invalid"}`) : undefined;
  };

  return (
    <form {...formProps} className="mt-8 max-w-xl space-y-6">
      <input type="hidden" name="resource_id" value={resourceId} />
      <input type="hidden" name="start" value={selectedStart} />

      <div className="grid gap-4 sm:grid-cols-2">
        {resources.length > 1 ? (
          <Select
            label={t("resource")}
            value={resourceId}
            onChange={(e) => {
              setResourceId(e.target.value);
              setSelectedStart("");
            }}
            options={resources.map((r) => ({ value: r.id, label: r.name }))}
          />
        ) : null}
        <TextInput
          label={t("partySize")}
          name="guests"
          type="number"
          min={1}
          max={maxPartySize ?? 100}
          defaultValue={1}
          required
          error={fieldError("guests")}
        />
        <TextInput
          label={t("date")}
          type="date"
          value={date}
          min={todayLocal()}
          max={maxDate.toISOString().slice(0, 10)}
          onChange={(e) => {
            setDate(e.target.value);
            setSelectedStart("");
          }}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("timeLabel")}</p>
        {resourceId && date ? (
          <SlotPicker
            key={`${resourceId}:${date}`}
            resourceId={resourceId}
            date={date}
            fetchSlots={fetchSlots}
            selectedStart={selectedStart}
            onSelect={setSelectedStart}
          />
        ) : null}
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-semibold">{t("contactTitle")}</legend>
        <TextInput label={t("name")} name="name" autoComplete="name" required maxLength={120} error={fieldError("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("email")}
            name="email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            maxLength={254}
            hint={t("emailHint")}
            error={fieldError("email")}
          />
          <TextInput label={t("phone")} name="phone" type="tel" autoComplete="tel" dir="ltr" maxLength={24} error={fieldError("phone")} />
        </div>
        <TextArea label={t("notes")} name="notes" maxLength={500} rows={3} />
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="pointer-events-none absolute size-px overflow-hidden opacity-0 [clip-path:inset(50%)]"
        />
      </fieldset>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {t.has(`errors.${state.error}` as "errors.generic") ? t(`errors.${state.error}` as "errors.generic") : t("errors.generic")}
        </p>
      ) : null}

      <SubmitButton pending={pending} disabled={!selectedStart} pendingLabel={t("requesting")}>
        {t("request")}
      </SubmitButton>
      <p className="text-xs text-muted">{t("requestHint")}</p>
    </form>
  );
}
