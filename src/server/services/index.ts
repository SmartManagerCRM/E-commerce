import "server-only";

/**
 * Server-side commerce service layer.
 *
 * This is the one boundary any caller — the console UI, the storefront, and
 * eventually an AI tool-calling layer — uses to act on tenant data. Nothing
 * downstream of here talks to Postgres directly: every function wraps either
 * a permission-checked, security-definer database function (the same ones
 * `app.has_permission()` / RLS already gate) or an RLS-scoped table read.
 * There is no separate, weaker auth path for automation — a caller must
 * already hold a real `TenantAdminContext` (staff, via `requireTenantAdmin`,
 * i.e. a signed-in session) or a resolved `ActiveStorefrontTenant` (a
 * customer, via the request's own Host header) before any of these will do
 * anything. An AI agent gets no more access than the human it's acting for.
 *
 *   branches → tables → table_sessions → orders → order_items
 *
 * is the dine-in half of the same order model the storefront's
 * carts → checkout → orders → order_items already uses; both paths end at
 * the identical `orders`/`order_items`/`order_status_history` tables and the
 * same status workflow (`app.allowed_next_statuses`).
 *
 * What's covered: products, inventory, carts, customers, tables, table
 * sessions, orders (both online and dine-in) and payments (Moyasar).
 * What's not: bookings and loyalty are architecture-planned (see
 * ARCHITECTURE.md §7.4) but not built yet — there is nothing here to wrap
 * until that schema exists, so this layer names no booking function rather
 * than pretend one works.
 */
export * as products from "./products";
export * as inventory from "./inventory";
export * as carts from "./carts";
export * as customers from "./customers";
export * as tables from "./tables";
export * as orders from "./orders";
export * as payments from "./payments";
