import type { LocalizedText } from "@/lib/localized";

/**
 * Product structure editor model. Options hold values; variants are the
 * combinations of one value per option. Keys identify values in the editor
 * (the database id for saved values, a temporary key for new ones).
 */
export type EditorValue = { id: string | null; key: string; label: LocalizedText };
export type EditorOption = { id: string | null; key: string; name: LocalizedText; values: EditorValue[] };
export type EditorVariant = {
  id: string | null;
  keys: string[];
  price: string;
  compare_at: string;
  sku: string;
  weight_g: string;
  image_id: string;
  initial_stock: string;
  /** Current stock of saved variants, shown read-only. */
  on_hand?: number | null;
};

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

export const comboKey = (keys: string[]) => keys.join("|");

/** Every combination of one value per option, in option order. */
export function combinations(options: EditorOption[]): string[][] {
  return options.reduce<string[][]>(
    (acc, option) => acc.flatMap((prefix) => option.values.map((value) => [...prefix, value.key])),
    [[]],
  );
}

export function combinationCount(options: EditorOption[]): number {
  return options.reduce((n, o) => n * o.values.length, 1);
}

export function emptyVariant(keys: string[], template?: Partial<EditorVariant>): EditorVariant {
  return {
    id: null,
    keys,
    price: template?.price ?? "",
    compare_at: template?.compare_at ?? "",
    sku: "",
    weight_g: template?.weight_g ?? "",
    image_id: "",
    initial_stock: "",
  };
}

/**
 * Rows for the current options. Existing rows are kept by exact combination;
 * when options are added or removed, an unused saved row whose values are a
 * subset/superset of a new combination is carried over (keeping its id, so
 * stock and history stay with it). Other new rows copy the first row's price.
 */
export function reconcileVariants(options: EditorOption[], previous: EditorVariant[]): EditorVariant[] {
  const combos = combinations(options);
  const byKey = new Map(previous.map((v) => [comboKey(v.keys), v]));
  const used = new Set<EditorVariant>();
  const rows: (EditorVariant | null)[] = combos.map((keys) => {
    const exact = byKey.get(comboKey(keys));
    if (exact) {
      used.add(exact);
      return { ...exact, keys };
    }
    return null;
  });
  combos.forEach((keys, i) => {
    if (rows[i]) return;
    const related = previous.find(
      (v) =>
        !used.has(v) &&
        v.id !== null &&
        (v.keys.every((k) => keys.includes(k)) || keys.every((k) => v.keys.includes(k))),
    );
    if (related) {
      used.add(related);
      rows[i] = { ...related, keys };
    }
  });
  const template = previous[0];
  return combos.map((keys, i) => rows[i] ?? emptyVariant(keys, template));
}

/** Label of a combination in one language, e.g. "250 g / Whole bean". */
export function comboLabel(options: EditorOption[], keys: string[], pick: (text: LocalizedText) => string): string {
  return keys.map((key, i) => pick(options[i]?.values.find((v) => v.key === key)?.label ?? {})).join(" / ");
}
