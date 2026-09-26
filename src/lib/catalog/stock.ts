/** Stock status as staff see it (mirrors `app.variant_availability`, without backorders). */
export type StockStatus = "untracked" | "out" | "low" | "ok";

export function stockStatus(item: {
  on_hand: number;
  reserved: number;
  min_stock: number;
  track_stock: boolean;
}): StockStatus {
  if (!item.track_stock) return "untracked";
  const available = item.on_hand - item.reserved;
  if (available <= 0) return "out";
  if (item.min_stock > 0 && available <= item.min_stock) return "low";
  return "ok";
}

export const STOCK_TONE = {
  untracked: "outline",
  out: "danger",
  low: "neutral",
  ok: "success",
} as const satisfies Record<StockStatus, string>;
