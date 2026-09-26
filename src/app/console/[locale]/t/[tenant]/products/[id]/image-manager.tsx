"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

const PHOTO_LIMIT = 8 * 1024 * 1024;
const REQUEST_LIMIT = 19 * 1024 * 1024;

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type ImageItem = { id: string; src: string; alt: LocalizedText };

function IconSubmit({
  action,
  imageId,
  intent,
  label,
  children,
}: {
  action: Action;
  imageId: string;
  intent: "up" | "down" | "delete";
  label: string;
  children: React.ReactNode;
}) {
  const { pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps}>
      <input type="hidden" name="image_id" value={imageId} />
      <input type="hidden" name="intent" value={intent} />
      <button
        type="submit"
        disabled={pending}
        aria-label={label}
        title={label}
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-muted hover:text-fg disabled:opacity-50"
      >
        {children}
      </button>
    </form>
  );
}

function AltForm({ action, image, locales }: { action: Action; image: ImageItem; locales: readonly Locale[] }) {
  const t = useTranslations("products");
  const tf = useTranslations("forms");
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);
  return (
    <form {...formProps} className="space-y-3">
      <input type="hidden" name="image_id" value={image.id} />
      <input type="hidden" name="intent" value="alt" />
      <LocalizedFields name="alt" label={t("altText")} locales={locales} defaultValue={image.alt} maxLength={200} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" size="sm">
          {tf("save")}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ImageManager({
  images,
  locales,
  canEdit,
  canUpload,
  uploadAction,
  imageAction,
}: {
  images: ImageItem[];
  locales: readonly Locale[];
  canEdit: boolean;
  canUpload: boolean;
  uploadAction: Action;
  imageAction: Action;
}) {
  const t = useTranslations("products");
  const tf = useTranslations("forms");
  const upload = useActionForm(uploadAction, idleState as FormState);
  const [tooLarge, setTooLarge] = useState(false);
  // Checked before sending: an oversized request would be rejected by the server without a useful message.
  const onUpload = (event: FormEvent<HTMLFormElement>) => {
    const files = [...((event.currentTarget.elements.namedItem("images") as HTMLInputElement | null)?.files ?? [])];
    const oversize = files.some((f) => f.size > PHOTO_LIMIT) || files.reduce((n, f) => n + f.size, 0) > REQUEST_LIMIT;
    setTooLarge(oversize);
    if (oversize) event.preventDefault();
    else upload.formProps.onSubmit(event);
  };

  return (
    <div className="space-y-6">
      {images.length > 0 ? (
        <ul className="space-y-4">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-4 rounded-md border border-border p-3 sm:flex-row">
              <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-md bg-bg">
                <Image src={image.src} alt="" fill sizes="112px" className="object-cover" />
                {index === 0 ? (
                  <span className="absolute start-1 top-1 rounded bg-fg/80 px-1.5 py-0.5 text-[11px] text-bg">
                    {t("cover")}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                {canEdit ? (
                  <>
                    <AltForm action={imageAction} image={image} locales={locales} />
                    <div className="flex gap-2">
                      {index > 0 ? (
                        <IconSubmit
                          action={imageAction}
                          imageId={image.id}
                          intent="up"
                          label={t("moveUp", { n: index + 1 })}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </IconSubmit>
                      ) : null}
                      {index < images.length - 1 ? (
                        <IconSubmit
                          action={imageAction}
                          imageId={image.id}
                          intent="down"
                          label={t("moveDown", { n: index + 1 })}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </IconSubmit>
                      ) : null}
                      {canUpload ? (
                        <IconSubmit
                          action={imageAction}
                          imageId={image.id}
                          intent="delete"
                          label={t("deleteImage", { n: index + 1 })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </IconSubmit>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">{Object.values(image.alt)[0] ?? ""}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("noImages")}</p>
      )}

      {canUpload ? (
        <form
          action={upload.formProps.action}
          onSubmit={onUpload}
          encType="multipart/form-data"
          className="space-y-2 rounded-md border border-dashed border-border p-4"
        >
          <label htmlFor="product-images" className="block text-sm font-medium">
            {t("addImages")}
          </label>
          <input
            id="product-images"
            type="file"
            name="images"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="max-w-full text-sm file:me-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
          />
          <p className="text-xs text-muted">{t("imagesHint")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={upload.pending} pendingLabel={tf("uploading")} variant="secondary" size="sm">
              {t("upload")}
            </SubmitButton>
            {tooLarge ? (
              <p role="alert" className="text-sm text-danger">
                {t("uploadTooLarge")}
              </p>
            ) : (
              <FormMessage state={upload.state} />
            )}
          </div>
        </form>
      ) : null}
    </div>
  );
}
