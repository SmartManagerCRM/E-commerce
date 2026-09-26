import { toMinorUnits } from "@/lib/money";

/**
 * Shop filters parsed from the URL. Everything is optional and tolerant:
 * an invalid value is ignored instead of breaking the page. Prices come in
 * as major units (what shoppers type) and are converted to minor units here.
 */
export const SORTS = ["featured", "newest", "price_asc", "price_desc", "name"] as const;
export type CatalogSort = (typeof SORTS)[number];

export const PAGE_SIZE = 24;
const MAX_PAGE = 500;

export type CatalogFilters = {
  q: string | null;
  minMinor: bigint | null;
  maxMinor: bigint | null;
  available: boolean;
  sort: CatalogSort;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseMoney(value: string | undefined, exponent: number): bigint | null {
  if (!value || value.trim() === "") return null;
  try {
    const minor = toMinorUnits(value.trim().replace(",", "."), exponent);
    return minor >= BigInt(0) ? minor : null;
  } catch {
    return null;
  }
}

export function parseCatalogFilters(params: SearchParams, exponent: number): CatalogFilters {
  const q = first(params.q)?.trim().slice(0, 100) || null;
  let minMinor = parseMoney(first(params.min), exponent);
  let maxMinor = parseMoney(first(params.max), exponent);
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) [minMinor, maxMinor] = [maxMinor, minMinor];
  const sortRaw = first(params.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as CatalogSort) : "featured";
  const pageNum = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_PAGE) : 1;
  return { q, minMinor, maxMinor, available: first(params.available) === "1", sort, page };
}

/** Builds a shop URL query string, leaving out defaults so URLs stay short and canonical. */
export function catalogQuery(filters: Partial<CatalogFilters>, exponent: number): string {
  const params = new URLSearchParams();
  const major = (minor: bigint) => {
    const divisor = BigInt(10) ** BigInt(exponent);
    const whole = minor / divisor;
    const fraction = (minor % divisor).toString().padStart(exponent, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : `${whole}`;
  };
  if (filters.q) params.set("q", filters.q);
  if (filters.minMinor != null) params.set("min", major(filters.minMinor));
  if (filters.maxMinor != null) params.set("max", major(filters.maxMinor));
  if (filters.available) params.set("available", "1");
  if (filters.sort && filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.q) || filters.minMinor !== null || filters.maxMinor !== null || filters.available;
}
