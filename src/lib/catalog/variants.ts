import type { Availability } from "@/lib/storefront/catalog-types";

/**
 * Variant selection on the product page. Pure functions over the public
 * product payload so the logic is unit-tested and shared by server and client.
 */
export type OptionView = { id: string; name: string; values: { id: string; label: string }[] };
export type VariantView = {
  id: string;
  optionValueIds: string[];
  priceMinor: string;
  compareAtMinor: string | null;
  availability: Availability;
  imageId: string | null;
};

/** optionId → selected valueId */
export type Selection = Record<string, string>;

const valueOption = (options: OptionView[]) => {
  const map = new Map<string, string>();
  for (const option of options) for (const value of option.values) map.set(value.id, option.id);
  return map;
};

export function selectionOf(variant: VariantView, options: OptionView[]): Selection {
  const owner = valueOption(options);
  const selection: Selection = {};
  for (const id of variant.optionValueIds) {
    const optionId = owner.get(id);
    if (optionId) selection[optionId] = id;
  }
  return selection;
}

/** First purchasable variant (falls back to the first one). */
export function defaultVariant<V extends VariantView>(variants: V[]): V | undefined {
  return variants.find((v) => v.availability !== "out_of_stock") ?? variants[0];
}

export function findVariant<V extends VariantView>(variants: V[], selection: Selection): V | undefined {
  const wanted = Object.values(selection);
  return variants.find(
    (v) => v.optionValueIds.length === wanted.length && wanted.every((id) => v.optionValueIds.includes(id)),
  );
}

/**
 * State of every option value given the other current choices:
 * `exists` — some variant combines it with the other selected values;
 * `available` — and that variant can be bought.
 */
export function valueStates(
  options: OptionView[],
  variants: VariantView[],
  selection: Selection,
): Record<string, { exists: boolean; available: boolean }> {
  const states: Record<string, { exists: boolean; available: boolean }> = {};
  for (const option of options) {
    for (const value of option.values) {
      const candidate = findVariant(variants, { ...selection, [option.id]: value.id });
      states[value.id] = {
        exists: Boolean(candidate),
        available: candidate?.availability !== undefined && candidate.availability !== "out_of_stock",
      };
    }
  }
  return states;
}

/**
 * Choosing a value: keep the other choices when that combination exists,
 * otherwise jump to the best variant that has the chosen value.
 */
export function chooseValue(
  options: OptionView[],
  variants: VariantView[],
  selection: Selection,
  optionId: string,
  valueId: string,
): Selection {
  const next = { ...selection, [optionId]: valueId };
  if (findVariant(variants, next)) return next;
  const withValue = variants.filter((v) => v.optionValueIds.includes(valueId));
  const best = withValue.find((v) => v.availability !== "out_of_stock") ?? withValue[0];
  return best ? selectionOf(best, options) : next;
}
