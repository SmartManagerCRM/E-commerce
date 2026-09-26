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
  parents: { value: string; label: string }[];
  submitLabel: string;
  disabled?: boolean;
  withImage?: { current: string | null; canUpload: boolean };
  category?: {
    name: LocalizedText;
    description: LocalizedText;
    slug: string;
    parentId: string | null;
    status: "active" | "hidden";
    position: number;
  };
};

export function CategoryForm({ action, locales, parents, submitLabel, disabled, withImage, category }: Props) {
  const t = useTranslations("categories");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} encType="multipart/form-data" className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <LocalizedFields
          name="name"
          label={t("name")}
          locales={locales}
          defaultValue={category?.name ?? {}}
          maxLength={120}
        />
        <LocalizedFields
          name="description"
          label={t("description")}
          locales={locales}
          defaultValue={category?.description ?? {}}
          maxLength={1000}
          multiline
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("parent")}
            name="parent_id"
            defaultValue={category?.parentId ?? ""}
            options={[{ value: "", label: t("noParent") }, ...parents]}
          />
          <Select
            label={t("visibility")}
            name="status"
            defaultValue={category?.status ?? "active"}
            options={(["active", "hidden"] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
          />
          <TextInput
            label={t("slug")}
            name="slug"
            defaultValue={category?.slug ?? ""}
            dir="ltr"
            maxLength={80}
            hint={t("slugHint")}
          />
          <TextInput
            label={t("position")}
            name="position"
            type="number"
            min={0}
            max={10000}
            defaultValue={String(category?.position ?? 0)}
            dir="ltr"
            hint={t("positionHint")}
          />
        </div>
        {withImage ? (
          <fieldset className="space-y-2 rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t("image")}</legend>
            {withImage.current ? (
              // eslint-disable-next-line @next/next/no-img-element -- small preview of the uploaded file
              <img src={withImage.current} alt="" className="h-24 w-32 rounded-md object-cover" />
            ) : (
              <p className="text-xs text-muted">{t("noImage")}</p>
            )}
            {withImage.canUpload ? (
              <>
                <label className="block text-sm">
                  <span className="sr-only">{t("image")}</span>
                  <input
                    type="file"
                    name="image"
                    accept="image/png,image/jpeg,image/webp"
                    className="max-w-full text-sm file:me-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
                  />
                </label>
                <p className="text-xs text-muted">{t("imageHint")}</p>
                {withImage.current ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="remove_image" className="size-4 accent-primary" />
                    {t("removeImage")}
                  </label>
                ) : null}
              </>
            ) : null}
          </fieldset>
        ) : null}
      </fieldset>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pending={pending} pendingLabel={tf("saving")}>
            {submitLabel}
          </SubmitButton>
          <FormMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
