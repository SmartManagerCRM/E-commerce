"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locales: readonly Locale[];
  disabled: boolean;
  categories: { id: string; label: string }[];
  product: {
    name: LocalizedText;
    subtitle: LocalizedText;
    description: LocalizedText;
    slug: string;
    status: "draft" | "active" | "archived";
    featured: boolean;
    categoryIds: string[];
  };
};

export function DetailsForm({ action, locales, disabled, categories, product }: Props) {
  const t = useTranslations("products");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset disabled={disabled} className="space-y-6">
        <LocalizedFields name="name" label={t("name")} locales={locales} defaultValue={product.name} maxLength={160} />
        <LocalizedFields
          name="subtitle"
          label={t("subtitle")}
          locales={locales}
          defaultValue={product.subtitle}
          maxLength={160}
        />
        <LocalizedFields
          name="description"
          label={t("description")}
          locales={locales}
          defaultValue={product.description}
          maxLength={5000}
          multiline
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("statusLabel")}
            name="status"
            defaultValue={product.status}
            hint={t("statusHint")}
            options={(["draft", "active", "archived"] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
          />
          <TextInput
            label={t("slug")}
            name="slug"
            defaultValue={product.slug}
            dir="ltr"
            maxLength={120}
            hint={t("slugHint")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" defaultChecked={product.featured} className="size-4 accent-primary" />
          {t("featuredLabel")}
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("categories")}</legend>
          {categories.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="category_ids[]"
                    value={c.id}
                    defaultChecked={product.categoryIds.includes(c.id)}
                    className="size-4 accent-primary"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">{t("noCategories")}</p>
          )}
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
