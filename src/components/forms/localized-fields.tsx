"use client";

import { LOCALE_NATIVE_NAMES, localeDirection, type Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/lib/localized";

import { TextArea, TextInput } from "./controls";

type LocalizedFieldsProps = {
  name: string;
  label: string;
  locales: readonly Locale[];
  defaultValue: LocalizedText;
  multiline?: boolean;
  maxLength: number;
};

/**
 * One input per enabled language, each with the right `lang`/`dir` so Arabic
 * is typed right-to-left even inside an English admin.
 */
export function LocalizedFields({ name, label, locales, defaultValue, multiline, maxLength }: LocalizedFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {locales.map((locale) => {
          const common = {
            name: `${name}.${locale}`,
            label: LOCALE_NATIVE_NAMES[locale],
            lang: locale,
            dir: localeDirection(locale),
            defaultValue: defaultValue[locale] ?? "",
            maxLength,
          };
          return multiline ? <TextArea key={locale} {...common} rows={3} /> : <TextInput key={locale} {...common} />;
        })}
      </div>
    </fieldset>
  );
}
