"use client";

import { useTranslations } from "next-intl";

import { Select, TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { LocalizedFields } from "@/components/forms/localized-fields";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";
import {
  BUTTON_OPTIONS,
  CARD_OPTIONS,
  HEADER_LAYOUTS,
  SOCIAL_NETWORKS,
  TYPOGRAPHY_OPTIONS,
  type SocialNetwork,
} from "@/lib/storefront/design";
import { idleState, type FormState } from "@/lib/validation/common";
import { useActionForm } from "@/components/forms/use-action-form";

export type DesignDefaults = {
  typography: string;
  buttons: string;
  cards: string;
  headerLayout: string;
  sticky: boolean;
  announcement: LocalizedText;
  social: Partial<Record<SocialNetwork, string>>;
};

const SOCIAL_PLACEHOLDER: Record<SocialNetwork, string> = {
  instagram: "https://instagram.com/…",
  tiktok: "https://tiktok.com/@…",
  x: "https://x.com/…",
  snapchat: "https://snapchat.com/add/…",
  facebook: "https://facebook.com/…",
  whatsapp: "https://wa.me/966…",
};

export function DesignForm({
  action,
  defaults,
  locales,
  canEdit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: DesignDefaults;
  locales: readonly Locale[];
  canEdit: boolean;
}) {
  const t = useTranslations("appearance.design");
  const tf = useTranslations("forms");
  const {
    state: state,
    pending: statePending,
    formProps: formActionProps,
  } = useActionForm(action, idleState as FormState);
  const options = (keys: readonly string[], ns: string) =>
    keys.map((k) => ({ value: k, label: t(`${ns}.${k}` as "typography.theme") }));

  return (
    <form {...formActionProps} className="space-y-8">
      <fieldset disabled={!canEdit} className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("typographyLabel")}
            name="typography"
            defaultValue={defaults.typography}
            options={options(TYPOGRAPHY_OPTIONS, "typography")}
          />
          <Select
            label={t("buttonsLabel")}
            name="buttons"
            defaultValue={defaults.buttons}
            options={options(BUTTON_OPTIONS, "buttons")}
          />
          <Select
            label={t("cardsLabel")}
            name="cards"
            defaultValue={defaults.cards}
            options={options(CARD_OPTIONS, "cards")}
          />
          <Select
            label={t("headerLabel")}
            name="header_layout"
            defaultValue={defaults.headerLayout}
            options={options(HEADER_LAYOUTS, "header")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sticky" defaultChecked={defaults.sticky} className="size-4 accent-primary" />
          {t("sticky")}
        </label>
        <LocalizedFields
          name="announcement"
          label={t("announcement")}
          locales={locales}
          defaultValue={defaults.announcement}
          maxLength={140}
        />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("social")}</legend>
          <p className="text-xs text-muted">{t("socialHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_NETWORKS.map((n) => (
              <TextInput
                key={n}
                label={t(`networks.${n}`)}
                name={`social.${n}`}
                type="url"
                dir="ltr"
                defaultValue={defaults.social[n] ?? ""}
                placeholder={SOCIAL_PLACEHOLDER[n]}
              />
            ))}
          </div>
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
