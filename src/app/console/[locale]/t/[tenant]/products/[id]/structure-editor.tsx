"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { LOCALE_NATIVE_NAMES, localeDirection, type Locale } from "@/i18n/locales";
import {
  combinationCount,
  comboKey,
  comboLabel,
  MAX_OPTIONS,
  MAX_VARIANTS,
  reconcileVariants,
  type EditorOption,
  type EditorVariant,
} from "@/lib/catalog/structure";
import { cn } from "@/lib/cn";
import { pickLocalized, type LocalizedText } from "@/lib/localized";
import { idleState, type FormState } from "@/lib/validation/common";

import { priceStep } from "../price-step";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locales: readonly Locale[];
  defaultLocale: Locale;
  uiLocale: Locale;
  currency: string;
  exponent: number;
  canEdit: boolean;
  canStock: boolean;
  images: { id: string; label: string }[];
  initialOptions: EditorOption[];
  initialVariants: EditorVariant[];
};

const cell = "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-base sm:text-sm";

/** One small input per language for option names and values. */
function LocalizedRow({
  value,
  onChange,
  locales,
  label,
  disabled,
}: {
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  locales: readonly Locale[];
  label: string;
  disabled: boolean;
}) {
  return (
    <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${locales.length}, minmax(0, 1fr))` }}>
      {locales.map((locale) => (
        <input
          key={locale}
          lang={locale}
          dir={localeDirection(locale)}
          value={value[locale] ?? ""}
          onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
          aria-label={`${label} (${LOCALE_NATIVE_NAMES[locale]})`}
          placeholder={locales.length > 1 ? LOCALE_NATIVE_NAMES[locale] : undefined}
          maxLength={60}
          disabled={disabled}
          className={cell}
        />
      ))}
    </div>
  );
}

/**
 * Options (Size, Grind…) and the variants they produce. Each combination
 * has its own price, sale price, SKU, weight and image. Everything is saved
 * together in one transaction by `save_product_structure`.
 */
export function StructureEditor({
  action,
  locales,
  defaultLocale,
  uiLocale,
  currency,
  exponent,
  canEdit,
  canStock,
  images,
  initialOptions,
  initialVariants,
}: Props) {
  const t = useTranslations("products");
  const tf = useTranslations("forms");
  const [options, setOptions] = useState(initialOptions);
  const [rows, setRows] = useState(() => reconcileVariants(initialOptions, initialVariants));
  const [bulkPrice, setBulkPrice] = useState("");
  const counter = useRef(0);
  const { state, pending, formProps } = useActionForm(action, idleState as FormState);

  const newKey = () => `new-${++counter.current}`;
  const pick = (text: LocalizedText) => pickLocalized(text, uiLocale, defaultLocale);
  const total = combinationCount(options);
  const tooMany = options.length > 0 && total > MAX_VARIANTS;
  const emptyOption = options.some((o) => o.values.length === 0);

  const updateOptions = (next: EditorOption[]) => {
    setOptions(next);
    if (!next.some((o) => o.values.length === 0) && combinationCount(next) <= MAX_VARIANTS) {
      setRows((current) => reconcileVariants(next, current));
    }
  };
  const patchOption = (index: number, patch: Partial<EditorOption>) =>
    updateOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const patchRow = (key: string, patch: Partial<EditorVariant>) =>
    setRows((current) => current.map((r) => (comboKey(r.keys) === key ? { ...r, ...patch } : r)));

  const payload = JSON.stringify({
    options: options.map((o) => ({
      id: o.id,
      name: o.name,
      values: o.values.map((v) => ({ id: v.id, key: v.key, label: v.label })),
    })),
    variants: rows.map((r) => ({
      id: r.id,
      keys: r.keys,
      price: r.price,
      compare_at: r.compare_at,
      sku: r.sku,
      weight_g: r.weight_g,
      image_id: r.image_id,
      initial_stock: r.id ? "" : r.initial_stock,
    })),
  });

  const disabled = !canEdit;
  const step = priceStep(exponent);

  return (
    <form {...formProps} className="space-y-6">
      <input type="hidden" name="structure" value={payload} />

      <div className="space-y-4">
        {options.length === 0 ? <p className="text-sm text-muted">{t("noOptions")}</p> : null}
        {options.map((option, index) => (
          <fieldset key={option.key} className="space-y-3 rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t("optionN", { n: index + 1 })}</legend>
            <div className="flex items-start gap-2">
              <LocalizedRow
                value={option.name}
                onChange={(name) => patchOption(index, { name })}
                locales={locales}
                label={t("optionName")}
                disabled={disabled}
              />
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => updateOptions(options.filter((_, i) => i !== index))}
                  aria-label={t("removeOption", { n: index + 1 })}
                  title={t("removeOption", { n: index + 1 })}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-danger/5 hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p className="text-xs text-muted">{t("optionNameHint")}</p>
            <ul className="space-y-2">
              {option.values.map((value, vIndex) => (
                <li key={value.key} className="flex items-start gap-2">
                  <LocalizedRow
                    value={value.label}
                    onChange={(label) =>
                      patchOption(index, {
                        values: option.values.map((v, i) => (i === vIndex ? { ...v, label } : v)),
                      })
                    }
                    locales={locales}
                    label={t("valueN", { n: vIndex + 1 })}
                    disabled={disabled}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => patchOption(index, { values: option.values.filter((_, i) => i !== vIndex) })}
                      aria-label={t("removeValue", { n: vIndex + 1 })}
                      title={t("removeValue", { n: vIndex + 1 })}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-fg/5 hover:text-fg"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit && option.values.length < 30 ? (
              <button
                type="button"
                onClick={() =>
                  patchOption(index, { values: [...option.values, { id: null, key: newKey(), label: {} }] })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary/5"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("addValue")}
              </button>
            ) : null}
          </fieldset>
        ))}
        {canEdit && options.length < MAX_OPTIONS ? (
          <button
            type="button"
            onClick={() =>
              updateOptions([
                ...options,
                { id: null, key: newKey(), name: {}, values: [{ id: null, key: newKey(), label: {} }] },
              ])
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm font-medium hover:bg-fg/5"
          >
            <Plus className="size-4" aria-hidden="true" />
            {options.length === 0 ? t("addFirstOption") : t("addOption")}
          </button>
        ) : null}
      </div>

      {tooMany ? (
        <p role="alert" className="text-sm text-danger">
          {t("tooManyVariants", { count: total, max: MAX_VARIANTS })}
        </p>
      ) : emptyOption ? (
        <p role="alert" className="text-sm text-danger">
          {t("optionNeedsValues")}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="text-sm font-medium">{t("variantsCount", { count: rows.length })}</h3>
            {canEdit && rows.length > 1 ? (
              <div className="flex items-end gap-2">
                <label className="text-xs text-muted">
                  <span className="mb-1 block">{t("setAllPrices")}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    dir="ltr"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className={cn(cell, "w-32")}
                  />
                </label>
                <button
                  type="button"
                  disabled={bulkPrice === ""}
                  onClick={() => setRows((current) => current.map((r) => ({ ...r, price: bulkPrice })))}
                  className="h-10 rounded-md border border-border px-3 text-sm hover:bg-fg/5 disabled:opacity-50"
                >
                  {t("apply")}
                </button>
              </div>
            ) : null}
          </div>
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("variant")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("priceWithCurrency", { currency })}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("compareAt")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("sku")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("weight")}
                  </th>
                  {images.length > 0 ? (
                    <th scope="col" className="px-2 py-2 text-start font-medium">
                      {t("image")}
                    </th>
                  ) : null}
                  <th scope="col" className="px-2 py-2 text-start font-medium">
                    {t("stock")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const key = comboKey(row.keys);
                  const label = options.length === 0 ? t("defaultVariant") : comboLabel(options, row.keys, pick) || "—";
                  return (
                    <tr key={key || "default"}>
                      <th scope="row" className="px-2 py-2 text-start font-medium">
                        {label}
                        {!row.id ? (
                          <span className="ms-2 text-xs font-normal text-muted">{t("newVariant")}</span>
                        ) : null}
                      </th>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={step}
                          dir="ltr"
                          required
                          value={row.price}
                          onChange={(e) => patchRow(key, { price: e.target.value })}
                          aria-label={`${t("price")} – ${label}`}
                          disabled={disabled}
                          className={cell}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={step}
                          dir="ltr"
                          value={row.compare_at}
                          onChange={(e) => patchRow(key, { compare_at: e.target.value })}
                          aria-label={`${t("compareAt")} – ${label}`}
                          disabled={disabled}
                          className={cell}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          dir="ltr"
                          maxLength={64}
                          value={row.sku}
                          onChange={(e) => patchRow(key, { sku: e.target.value })}
                          aria-label={`${t("sku")} – ${label}`}
                          disabled={disabled}
                          className={cell}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          dir="ltr"
                          value={row.weight_g}
                          onChange={(e) => patchRow(key, { weight_g: e.target.value })}
                          aria-label={`${t("weight")} – ${label}`}
                          disabled={disabled}
                          className={cn(cell, "w-24")}
                        />
                      </td>
                      {images.length > 0 ? (
                        <td className="px-2 py-2">
                          <select
                            value={row.image_id}
                            onChange={(e) => patchRow(key, { image_id: e.target.value })}
                            aria-label={`${t("image")} – ${label}`}
                            disabled={disabled}
                            className={cell}
                          >
                            <option value="">{t("noImage")}</option>
                            {images.map((image) => (
                              <option key={image.id} value={image.id}>
                                {image.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      <td className="px-2 py-2 tabular-nums">
                        {row.id ? (
                          row.on_hand === null || row.on_hand === undefined ? (
                            <span className="text-muted">{t("notTracked")}</span>
                          ) : (
                            row.on_hand
                          )
                        ) : canStock ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            dir="ltr"
                            value={row.initial_stock}
                            onChange={(e) => patchRow(key, { initial_stock: e.target.value })}
                            aria-label={`${t("initialStock")} – ${label}`}
                            placeholder={t("initialStock")}
                            className={cn(cell, "w-24")}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t("variantsHint")}</p>
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pending={pending} pendingLabel={tf("saving")} disabled={tooMany || emptyOption}>
            {t("saveVariants")}
          </SubmitButton>
          <FormMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
