"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Select, TextInput } from "@/components/forms/controls";
import { CopyLink } from "@/components/forms/copy-link";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LOCALES, LOCALE_NATIVE_NAMES } from "@/i18n/locales";
import { idleState, type FormState } from "@/lib/validation/common";

type Result = { tenantId: string; link: string };

type Props = {
  action: (state: FormState<Result>, formData: FormData) => Promise<FormState<Result>>;
  plans: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  businessTypes: { value: string; label: string }[];
  timezones: string[];
};

export function CreateTenantForm({ action, plans, currencies, businessTypes, timezones }: Props) {
  const t = useTranslations("platformAdmin.create");
  const tf = useTranslations("forms");
  const [state, formAction] = useActionState(action, idleState as FormState<Result>);
  const err = (key: string) =>
    state.status === "error" && state.fieldErrors?.[key] ? tf("errors.invalidField") : undefined;

  if (state.status === "success" && state.data) {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <p className="text-sm">{t("shareOwnerLink")}</p>
        <CopyLink link={state.data.link} label={t("ownerLink")} />
        <Link href={`/platform/tenants/${state.data.tenantId}`} className={buttonClasses("primary")}>
          {t("openBusiness")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          label={t("businessName")}
          name="business_name"
          required
          maxLength={120}
          error={err("business_name")}
        />
        <TextInput
          label={t("slug")}
          name="slug"
          required
          dir="ltr"
          pattern="[a-z0-9-]+"
          hint={t("slugHint")}
          error={err("slug")}
        />
        <Select label={t("businessType")} name="business_type" options={businessTypes} defaultValue="cafe" />
        <Select label={t("plan")} name="plan_key" options={plans} />
        <Select label={t("currency")} name="currency" options={currencies} defaultValue="SAR" />
        <Select
          label={t("timezone")}
          name="timezone"
          options={timezones.map((tz) => ({ value: tz, label: tz }))}
          defaultValue="Asia/Riyadh"
        />
        <TextInput
          label={t("country")}
          name="country"
          dir="ltr"
          maxLength={2}
          hint={t("countryHint")}
          error={err("country")}
        />
        <TextInput label={t("city")} name="city" maxLength={100} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("languages")}</legend>
        <div className="flex flex-wrap gap-4">
          {LOCALES.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled_languages[]"
                value={l}
                defaultChecked
                className="size-4 accent-primary"
              />
              {LOCALE_NATIVE_NAMES[l]}
            </label>
          ))}
        </div>
        <div className="max-w-xs">
          <Select
            label={t("defaultLanguage")}
            name="default_language"
            defaultValue="ar"
            options={LOCALES.map((l) => ({ value: l, label: LOCALE_NATIVE_NAMES[l] }))}
            error={err("default_language")}
          />
        </div>
      </fieldset>

      <TextInput
        label={t("ownerEmail")}
        name="owner_email"
        type="email"
        dir="ltr"
        required
        hint={t("ownerEmailHint")}
        error={err("owner_email")}
      />

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
        <SubmitButton pendingLabel={tf("saving")}>{t("submit")}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
