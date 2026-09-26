"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import type { Section } from "@/lib/storefront/sections";
import { idleState, type FormState } from "@/lib/validation/common";
import { useActionForm } from "@/components/forms/use-action-form";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Cta({
  prefix,
  value,
  locales,
}: {
  prefix: string;
  value: { label: LocalizedText; href: string } | null;
  locales: readonly Locale[];
}) {
  const t = useTranslations("homepageEditor.fields");
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium">{t("button")}</legend>
      <LocalizedFields
        name={`${prefix}.label`}
        label={t("buttonLabel")}
        locales={locales}
        defaultValue={value?.label ?? {}}
        maxLength={40}
      />
      <TextInput
        label={t("buttonLink")}
        name={`${prefix}.href`}
        defaultValue={value?.href ?? ""}
        dir="ltr"
        placeholder="/ · #visit · https://… · tel:…"
        hint={t("buttonLinkHint")}
      />
    </fieldset>
  );
}

function ImageField({ current }: { current: string | null }) {
  const t = useTranslations("homepageEditor.fields");
  return (
    <fieldset className="space-y-2 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium">{t("image")}</legend>
      <p className="text-xs text-muted">{current ? t("imageCurrent") : t("imageNone")}</p>
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
      {current ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remove_image" className="size-4 accent-primary" />
          {t("removeImage")}
        </label>
      ) : null}
    </fieldset>
  );
}

function LimitSelect({ value }: { value: number }) {
  const t = useTranslations("homepageEditor.fields");
  return (
    <Select
      label={t("productLimit")}
      name="props.limit"
      defaultValue={String(value)}
      options={[4, 8, 12].map((n) => ({ value: String(n), label: t("productLimitOption", { count: n }) }))}
    />
  );
}

export function SectionForm({
  section,
  action,
  locales,
  categories,
}: {
  section: Section;
  action: Action;
  locales: readonly Locale[];
  categories: { value: string; label: string }[];
}) {
  const t = useTranslations("homepageEditor.fields");
  const tf = useTranslations("forms");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  const L = (name: string, label: string, value: LocalizedText, opts: { multiline?: boolean; max?: number } = {}) => (
    <LocalizedFields
      name={`props.${name}`}
      label={label}
      locales={locales}
      defaultValue={value}
      multiline={opts.multiline}
      maxLength={opts.max ?? 200}
    />
  );

  let fields: React.ReactNode = null;
  switch (section.type) {
    case "hero":
      fields = (
        <>
          <Select
            label={t("layout")}
            name="props.variant"
            defaultValue={section.props.variant}
            options={(["split", "centered", "image"] as const).map((v) => ({ value: v, label: t(`heroVariant.${v}`) }))}
          />
          {L("eyebrow", t("eyebrow"), section.props.eyebrow, { max: 80 })}
          {L("title", t("title"), section.props.title, { max: 120 })}
          {L("subtitle", t("subtitle"), section.props.subtitle, { multiline: true, max: 400 })}
          <ImageField current={section.props.image_path} />
          <Cta prefix="props.cta" value={section.props.cta} locales={locales} />
        </>
      );
      break;
    case "promo_banner":
      fields = (
        <>
          {L("text", t("message"), section.props.text, { max: 160 })}
          <Select
            label={t("tone")}
            name="props.tone"
            defaultValue={section.props.tone}
            options={(["primary", "accent", "dark"] as const).map((v) => ({ value: v, label: t(`toneOption.${v}`) }))}
          />
          <Cta prefix="props.cta" value={section.props.cta} locales={locales} />
        </>
      );
      break;
    case "brand_story":
      fields = (
        <>
          <Select
            label={t("layout")}
            name="props.variant"
            defaultValue={section.props.variant}
            options={(["image_start", "image_end"] as const).map((v) => ({ value: v, label: t(`storyVariant.${v}`) }))}
          />
          {L("eyebrow", t("eyebrow"), section.props.eyebrow, { max: 80 })}
          {L("title", t("title"), section.props.title, { max: 120 })}
          {L("body", t("body"), section.props.body, { multiline: true, max: 2000 })}
          <ImageField current={section.props.image_path} />
        </>
      );
      break;
    case "testimonials": {
      const items = [
        ...section.props.items,
        ...(section.props.items.length < 6 ? [{ quote: {}, author: "", detail: {} }] : []),
      ];
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          {items.map((item, i) => (
            <fieldset key={i} className="space-y-3 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-medium">{t("testimonial", { n: i + 1 })}</legend>
              <LocalizedFields
                name={`props.items.${i}.quote`}
                label={t("quote")}
                locales={locales}
                defaultValue={item.quote}
                multiline
                maxLength={500}
              />
              <TextInput
                label={t("author")}
                name={`props.items.${i}.author`}
                defaultValue={item.author}
                maxLength={80}
              />
              <LocalizedFields
                name={`props.items.${i}.detail`}
                label={t("authorDetail")}
                locales={locales}
                defaultValue={item.detail}
                maxLength={80}
              />
            </fieldset>
          ))}
          <p className="text-xs text-muted">{t("testimonialsHint")}</p>
        </>
      );
      break;
    }
    case "location":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="props.show_hours"
              defaultChecked={section.props.show_hours}
              className="size-4 accent-primary"
            />
            {t("showHours")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="props.show_map"
              defaultChecked={section.props.show_map}
              className="size-4 accent-primary"
            />
            {t("showDirections")}
          </label>
          <p className="text-xs text-muted">{t("locationHint")}</p>
        </>
      );
      break;
    case "best_sellers":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          <LimitSelect value={section.props.limit} />
          <p className="text-xs text-muted">{t("bestSellersHint")}</p>
        </>
      );
      break;
    case "featured_products":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          <LimitSelect value={section.props.limit} />
          <p className="text-xs text-muted">{t("featuredProductsHint")}</p>
        </>
      );
      break;
    case "featured_categories":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          <p className="text-xs text-muted">{t("featuredCategoriesHint")}</p>
        </>
      );
      break;
    case "product_collection":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          {categories.length > 0 ? (
            <Select
              label={t("category")}
              name="props.category"
              defaultValue={section.props.category ?? ""}
              options={[{ value: "", label: t("chooseCategory") }, ...categories]}
            />
          ) : (
            <p className="text-sm text-muted">{t("noCategories")}</p>
          )}
          <LimitSelect value={section.props.limit} />
        </>
      );
      break;
    case "newsletter":
      fields = (
        <>
          {L("title", t("title"), section.props.title, { max: 120 })}
          {L("subtitle", t("subtitle"), section.props.subtitle, { max: 240 })}
          <p className="text-xs text-muted">{t("newsletterHint")}</p>
        </>
      );
      break;
  }

  return (
    <form {...formActionProps} className="space-y-5" encType="multipart/form-data">
      <input type="hidden" name="section_id" value={section.id} />
      {fields}
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pending={statePending} pendingLabel={tf("saving")}>
          {tf("save")}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
