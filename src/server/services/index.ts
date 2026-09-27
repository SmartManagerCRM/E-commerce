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
 * sessions, orders (both online and dine-in), payments (Moyasar), bookings
 * (branches → booking_resources → bookings), loyalty (program settings,
 * tiers, rewards, a customer's points ledger) and the AI foundation
 * (entitlements, tenant settings, usage). The AI ordering assistant and
 * business copilot themselves are a later phase — this only exposes what
 * exists so far. Subscriptions and marketing campaigns remain
 * architecture-planned (see ARCHITECTURE.md §7.4) but not built yet.
 */
export * as products from "./products";
export * as inventory from "./inventory";
export * as carts from "./carts";
export * as customers from "./customers";
export * as tables from "./tables";
export * as orders from "./orders";
export * as payments from "./payments";
export * as bookings from "./bookings";
export * as loyalty from "./loyalty";
export * as ai from "./ai";
