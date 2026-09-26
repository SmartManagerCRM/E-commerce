"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { LOCALES, LOCALE_NATIVE_NAMES, type Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

import { LocalizedFields } from "@/components/forms/localized-fields";
import { useActionForm } from "@/components/forms/use-action-form";

export type ProfileDefaults = {
  business_name: string;
  tagline: LocalizedText;
  description: LocalizedText;
  phone: string;
  email: string;
  address: Record<string, string>;
  city: string;
  country: string;
  timezone: string;
  currency: string;
  default_language: Locale;
  enabled_languages: Locale[];
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: ProfileDefaults;
  timezones: string[];
  canEdit: boolean;
};

export function ProfileForm({ action, defaults, timezones, canEdit }: Props) {
  const t = useTranslations("settings.profile");
  const tf = useTranslations("forms");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  const err = (key: string) =>
    state.status === "error" && state.fieldErrors?.[key] ? tf("errors.invalidField") : undefined;

  return (
    <form {...formActionProps} className="space-y-8">
      <fieldset disabled={!canEdit} className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label={t("businessName")}
            name="business_name"
            defaultValue={defaults.business_name}
            required
            maxLength={120}
            error={err("business_name")}
          />
          <TextInput label={t("currency")} value={defaults.currency} readOnly disabled hint={t("currencyHint")} />
        </div>

        <LocalizedFields
          name="tagline"
          label={t("tagline")}
          locales={LOCALES}
          defaultValue={defaults.tagline}
          maxLength={160}
        />
        <LocalizedFields
          name="description"
          label={t("descriptionField")}
          locales={LOCALES}
          defaultValue={defaults.description}
          maxLength={1000}
          multiline
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("languages")}</legend>
          <p className="text-xs text-muted">{t("languagesHint")}</p>
          <div className="flex flex-wrap gap-4">
            {LOCALES.map((locale) => (
              <label key={locale} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled_languages[]"
                  value={locale}
                  defaultChecked={defaults.enabled_languages.includes(locale)}
                  className="size-4 accent-primary"
                />
                {LOCALE_NATIVE_NAMES[locale]}
              </label>
            ))}
          </div>
          <div className="max-w-xs">
            <Select
              label={t("defaultLanguage")}
              name="default_language"
              defaultValue={defaults.default_language}
              options={LOCALES.map((l) => ({ value: l, label: LOCALE_NATIVE_NAMES[l] }))}
              error={err("default_language") ? t("defaultLanguageError") : undefined}
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="mb-3 text-sm font-medium md:col-span-2">{t("contact")}</legend>
          <TextInput
            label={t("phone")}
            name="phone"
            type="tel"
            dir="ltr"
            defaultValue={defaults.phone}
            maxLength={32}
          />
          <TextInput
            label={t("email")}
            name="email"
            type="email"
            dir="ltr"
            defaultValue={defaults.email}
            error={err("email")}
          />
          <TextInput
            label={t("addressLine1")}
            name="address_line1"
            defaultValue={defaults.address.line1 ?? ""}
            maxLength={200}
          />
          <TextInput
            label={t("addressLine2")}
            name="address_line2"
            defaultValue={defaults.address.line2 ?? ""}
            maxLength={200}
          />
          <TextInput label={t("city")} name="city" defaultValue={defaults.city} maxLength={100} />
          <TextInput
            label={t("postalCode")}
            name="postal_code"
            defaultValue={defaults.address.postal_code ?? ""}
            maxLength={20}
          />
          <TextInput
            label={t("country")}
            name="country"
            defaultValue={defaults.country}
            maxLength={2}
            hint={t("countryHint")}
            dir="ltr"
            error={err("country")}
          />
          <Select
            label={t("timezone")}
            name="timezone"
            defaultValue={defaults.timezone}
            options={timezones.map((tz) => ({ value: tz, label: tz }))}
          />
        </fieldset>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
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
