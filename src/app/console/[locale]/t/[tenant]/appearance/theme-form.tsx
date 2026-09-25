"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { cn } from "@/lib/cn";
import { idleState, type FormState } from "@/lib/validation/common";
import { THEMES, type ThemeKey } from "@/themes/definitions";
import { contrastRatio, ensureContrast } from "@/themes/tokens";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  themeKey: ThemeKey;
  primary: string;
  accent: string;
  canEdit: boolean;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  name,
  label,
  value,
  fallback,
  background,
  foreground,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  value: string;
  fallback: string;
  background: string;
  foreground: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("appearance.colors");
  const effective = HEX.test(value) ? value : fallback;
  const ratio = contrastRatio(effective, background);
  const corrected = ensureContrast(effective, background, foreground);
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${name}-text`} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={effective}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-11 w-14 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <input
          id={`${name}-text`}
          name={name}
          value={value}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          dir="ltr"
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          className="h-11 w-32 rounded-md border border-border bg-surface px-3 font-mono text-sm"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            className="text-xs text-muted underline"
          >
            {t("reset")}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {ratio >= 4.5 ? t("contrastOk") : t("contrastAdjusted", { color: corrected })}
      </p>
    </div>
  );
}

export function ThemeForm({ action, themeKey, primary, accent, canEdit }: Props) {
  const t = useTranslations("appearance");
  const tf = useTranslations("forms");
  const [state, formAction] = useActionState(action, idleState as FormState);
  const [selected, setSelected] = useState<ThemeKey>(themeKey);
  const [primaryValue, setPrimary] = useState(primary);
  const [accentValue, setAccent] = useState(accent);
  const theme = THEMES[selected];
  const previewPrimary = HEX.test(primaryValue) ? primaryValue : theme.colors.primary;
  const previewAccent = HEX.test(accentValue) ? accentValue : theme.colors.accent;

  return (
    <form action={formAction} className="space-y-8">
      <fieldset disabled={!canEdit}>
        <legend className="mb-3 text-sm font-medium">{t("theme")}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const def = THEMES[key];
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                  selected === key ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-fg/30",
                )}
              >
                <input
                  type="radio"
                  name="theme_key"
                  value={key}
                  checked={selected === key}
                  onChange={() => setSelected(key)}
                  className="sr-only"
                />
                <span className="flex gap-1" aria-hidden="true">
                  {[def.colors.background, def.colors.foreground, def.colors.primary, def.colors.accent].map((c, i) => (
                    <span key={i} className="size-6 rounded-full border border-border" style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="text-sm font-medium">{t(`themes.${key}.name`)}</span>
                <span className="text-xs text-muted">{t(`themes.${key}.description`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="space-y-4">
        <legend className="mb-1 text-sm font-medium">{t("colors.title")}</legend>
        <p className="text-xs text-muted">{t("colors.hint")}</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <ColorField
            name="primary"
            label={t("colors.primary")}
            value={primaryValue}
            fallback={theme.colors.primary}
            background={theme.colors.background}
            foreground={theme.colors.foreground}
            onChange={setPrimary}
            disabled={!canEdit}
          />
          <ColorField
            name="accent"
            label={t("colors.accent")}
            value={accentValue}
            fallback={theme.colors.accent}
            background={theme.colors.background}
            foreground={theme.colors.foreground}
            onChange={setAccent}
            disabled={!canEdit}
          />
        </div>
      </fieldset>

      <div
        className="rounded-lg border border-border p-6"
        style={{ backgroundColor: theme.colors.background, color: theme.colors.foreground }}
        aria-label={t("preview")}
      >
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: ensureContrast(previewAccent, theme.colors.background, theme.colors.foreground) }}
        >
          {t("previewEyebrow")}
        </p>
        <p className="mt-2 text-2xl font-semibold">{t("previewTitle")}</p>
        <span
          className="mt-4 inline-flex h-10 items-center px-5 text-sm font-medium"
          style={{
            backgroundColor: previewPrimary,
            color:
              contrastRatio(previewPrimary, "#FFFFFF") >= contrastRatio(previewPrimary, "#111111")
                ? "#FFFFFF"
                : "#111111",
            borderRadius: theme.button === "pill" ? 9999 : theme.button === "square" ? 0 : 8,
          }}
        >
          {t("previewButton")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
        {canEdit ? <SubmitButton pendingLabel={tf("saving")}>{tf("save")}</SubmitButton> : null}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
