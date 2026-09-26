/**
 * Order workflow shared by the console UI and tests. The database
 * (`app.allowed_next_statuses`) is authoritative; this mirror only decides
 * which buttons to show.
 */
export const ORDER_STATUSES = [
  "pending_payment",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Fulfillment = "pickup" | "delivery" | "dine_in";
export type PaymentMethod = "pay_on_fulfillment" | "online";

export const OPEN_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];

export function nextStatuses(status: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  const handOff: OrderStatus = fulfillment === "delivery" ? "out_for_delivery" : "ready";
  switch (status) {
    // An unpaid online order can only be cancelled: it is never hand-advanced past payment.
    case "pending_payment":
      return ["cancelled"];
    case "pending":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["preparing", handOff, "completed", "cancelled"];
    case "preparing":
      return [handOff, "completed", "cancelled"];
    case "ready":
    case "out_for_delivery":
      return ["completed", "cancelled"];
    default:
      return [];
  }
}

/** Customer-facing progress steps for the order status page. */
export function progressSteps(fulfillment: Fulfillment): OrderStatus[] {
  return ["pending", "confirmed", "preparing", fulfillment === "delivery" ? "out_for_delivery" : "ready", "completed"];
}

export const CHECKOUT_PROBLEMS = [
  "empty_cart",
  "unavailable_items",
  "insufficient_stock",
  "ordering_closed",
  "fulfillment_unavailable",
  "below_minimum",
] as const;
export type CheckoutProblem = (typeof CHECKOUT_PROBLEMS)[number];

export function parseProblems(value: unknown): CheckoutProblem[] {
  const list = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(list)
    ? list.filter((p): p is CheckoutProblem => (CHECKOUT_PROBLEMS as readonly string[]).includes(p))
    : [];
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
