"use client";

import { useTranslations } from "next-intl";

import { TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

import { priceStep } from "../../products/price-step";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

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

export function CommerceSettingsForm({
  action,
  disabled,
  hasDelivery,
  currency,
  exponent,
  values,
}: {
  action: Action;
  disabled: boolean;
  hasDelivery: boolean;
  currency: string;
  exponent: number;
  values: {
    acceptingOrders: boolean;
    pickup: boolean;
    delivery: boolean;
    payOnFulfillment: boolean;
    minOrder: string;
    taxRate: string;
    taxIncluded: boolean;
    taxRegistrationNumber: string;
  };
}) {
  const t = useTranslations("checkoutSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <Toggle
          name="accepting_orders"
          label={t("acceptingOrders")}
          hint={t("acceptingOrdersHint")}
          defaultChecked={values.acceptingOrders}
        />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{t("fulfillmentTitle")}</legend>
          <Toggle name="pickup" label={t("pickup")} hint={t("pickupHint")} defaultChecked={values.pickup} />
          <Toggle
            name="delivery"
            label={t("delivery")}
            hint={hasDelivery ? t("deliveryHint") : t("deliveryNotEntitled")}
            defaultChecked={values.delivery && hasDelivery}
            disabled={!hasDelivery}
          />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{t("paymentTitle")}</legend>
          <Toggle
            name="pay_on_fulfillment"
            label={t("payOnFulfillment")}
            hint={t("payOnFulfillmentHint")}
            defaultChecked={values.payOnFulfillment}
          />
          <p className="text-xs text-muted">{t("onlinePaymentsLater")}</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("minOrder", { currency })}
            name="min_order"
            type="number"
            min={0}
            step={priceStep(exponent)}
            defaultValue={values.minOrder}
            hint={t("minOrderHint")}
            dir="ltr"
          />
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{t("taxTitle")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t("taxRate")}
              name="tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={values.taxRate}
              hint={t("taxRateHint")}
              dir="ltr"
            />
            <TextInput
              label={t("taxNumber")}
              name="tax_registration_number"
              defaultValue={values.taxRegistrationNumber}
              maxLength={30}
              dir="ltr"
            />
          </div>
          <Toggle
            name="tax_included"
            label={t("taxIncluded")}
            hint={t("taxIncludedHint")}
            defaultChecked={values.taxIncluded}
          />
        </fieldset>
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

type ZoneValues = {
  id: string;
  name: LocalizedText;
  fee: string;
  minOrder: string;
  freeOver: string;
  eta: string;
  active: boolean;
  position: number;
};

export function ZoneForm({
  action,
  remove,
  locales,
  currency,
  exponent,
  disabled,
  zone,
  position,
}: {
  action: Action;
  remove?: (state: FormState) => Promise<FormState>;
  locales: readonly Locale[];
  currency: string;
  exponent: number;
  disabled: boolean;
  zone: ZoneValues | null;
  position?: number;
}) {
  const t = useTranslations("checkoutSettings");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  const removal = useActionForm(remove ?? (async () => idleState as FormState), idleState as FormState);
  const step = priceStep(exponent);
  return (
    <div className="rounded-md border border-border p-4">
      <form {...formProps} className="space-y-4">
        <p className="text-sm font-semibold">{zone ? t("zone") : t("newZone")}</p>
        {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
        <input type="hidden" name="position" value={zone?.position ?? position ?? 0} />
        <fieldset disabled={disabled} className="space-y-4">
          <LocalizedFields
            name="name"
            label={t("zoneName")}
            locales={locales}
            defaultValue={zone?.name ?? {}}
            maxLength={80}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput
              label={t("fee", { currency })}
              name="fee"
              type="number"
              min={0}
              step={step}
              required
              defaultValue={zone?.fee ?? "0"}
              dir="ltr"
            />
            <TextInput
              label={t("zoneMin", { currency })}
              name="min_order"
              type="number"
              min={0}
              step={step}
              defaultValue={zone?.minOrder ?? ""}
              dir="ltr"
            />
            <TextInput
              label={t("freeOver", { currency })}
              name="free_over"
              type="number"
              min={0}
              step={step}
              defaultValue={zone?.freeOver ?? ""}
              dir="ltr"
            />
            <TextInput
              label={t("eta")}
              name="eta_minutes"
              type="number"
              min={0}
              max={10080}
              defaultValue={zone?.eta ?? ""}
              dir="ltr"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={zone?.active ?? true}
              className="size-4 accent-primary"
            />
            {t("zoneActive")}
          </label>
        </fieldset>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              pending={pending}
              pendingLabel={tf("saving")}
              variant={zone ? "secondary" : "primary"}
              size="sm"
            >
              {zone ? tf("save") : t("addZone")}
            </SubmitButton>
            <FormMessage state={state} />
          </div>
        ) : null}
      </form>
      {zone && remove && !disabled ? (
        <form {...removal.formProps} className="mt-3 border-t border-border pt-3">
          <button type="submit" disabled={removal.pending} className="text-sm text-danger hover:underline">
            {t("deleteZone")}
          </button>
          <FormMessage state={removal.state} />
        </form>
      ) : null}
    </div>
  );
}
