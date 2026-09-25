"use client";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

type Props = {
  kind: "logo" | "favicon";
  currentUrl: string | null;
  upload: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: (state: FormState) => Promise<FormState>;
  canEdit: boolean;
};

export function BrandingForm({ kind, currentUrl, upload, remove, canEdit }: Props) {
  const t = useTranslations("appearance.branding");
  const tf = useTranslations("forms");
  const [uploadState, uploadAction] = useActionState(upload, idleState as FormState);
  const [removeState, removeAction] = useActionState(remove, idleState as FormState);
  const inputId = `${kind}-file`;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-bg">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny preview of the uploaded asset
          <img src={currentUrl} alt={t(`${kind}Alt`)} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="size-8 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 space-y-3">
        <p className="text-sm font-medium">{t(`${kind}Title`)}</p>
        <p className="text-xs text-muted">{t(`${kind}Hint`)}</p>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={uploadAction} className="flex flex-wrap items-center gap-3">
              <label htmlFor={inputId} className="sr-only">
                {t(`${kind}Title`)}
              </label>
              <input
                id={inputId}
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="max-w-full text-sm file:me-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
              />
              <SubmitButton variant="secondary" size="sm" pendingLabel={tf("uploading")}>
                {t("upload")}
              </SubmitButton>
            </form>
            {currentUrl ? (
              <form action={removeAction}>
                <SubmitButton variant="ghost" size="sm">
                  {t("remove")}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
        <FormMessage state={uploadState} />
        <FormMessage state={removeState} />
      </div>
    </div>
  );
}
