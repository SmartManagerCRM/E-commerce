import "server-only";

import type { Locale } from "@/i18n/locales";
import { defaultVariant, findVariant } from "@/lib/catalog/variants";
import { pickLocalized } from "@/lib/localized";
import type { ActiveStorefrontTenant } from "@/lib/tenant";
import { ensureCartTokenHash, hashToken, newToken } from "@/server/commerce/cart-cookie";
import { getCart, getCheckoutOptions } from "@/server/commerce/storefront";
import { getCatalog, getProduct, type ProductDetail } from "@/server/catalog/storefront";
import { notifyNewOrderStaff, notifyOrderPlaced } from "@/server/notifications/notify";
import { serviceClient } from "@/server/supabase/clients";
import { consoleOrigin, storefrontOrigin } from "@/server/tenant/urls";

import type { AIToolDefinition } from "./provider";

/**
 * The AI's only way to touch commerce data — every tool here wraps an
 * existing, already-tested storefront read or a service-role-only database
 * function, the exact same ones the human storefront UI calls. There is no
 * separate, looser path for the assistant: it can only ever do what a guest
 * browsing the site by hand could already do, and every price/stock/table/
 * total figure it uses comes from one of these calls, never from the model
 * itself (spec §7/§68 — database truth always wins over model memory).
 */
export type ToolContext = {
  tenant: ActiveStorefrontTenant;
  locale: Locale;
  conversationId: string;
  cartTokenHash: string;
};

export type ToolResult = { content: string; isError?: boolean };

const TOOL_DEFINITIONS: AIToolDefinition[] = [
  {
    name: "search_products",
    description: "Search the store's catalog by free-text query and/or category. Returns matching products with price and availability.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search, e.g. a dish name or ingredient." },
        category: { type: "string", description: "A category slug, if known." },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: "get_product_details",
    description: "Get full details for one product by its slug, including its options (e.g. size) and per-variant prices/availability.",
    parameters: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "view_cart",
    description: "See what's currently in the customer's cart.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "add_to_cart",
    description: "Add a product to the cart. If the product has options (e.g. size), pass the customer's chosen value for each option name; if omitted and the product has only one variant, that variant is used.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 99 },
        options: { type: "object", description: "Option name -> chosen value, e.g. {\"Size\": \"Large\"}", additionalProperties: { type: "string" } },
      },
      required: ["slug", "quantity"],
    },
  },
  {
    name: "update_cart_item",
    description: "Change the quantity of a product already in the cart, or remove it (quantity 0). Use the same options used to add it.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        quantity: { type: "integer", minimum: 0, maximum: 99 },
        options: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["slug", "quantity"],
    },
  },
  {
    name: "set_fulfillment",
    description: "Record how the customer wants their order: pickup, delivery, or dine_in. For dine_in, table_label is REQUIRED (e.g. \"12\" or \"Table 12\") — never proceed to payment for a dine-in order without this succeeding. For delivery, zone_name should match one of the store's delivery areas.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["pickup", "delivery", "dine_in"] },
        table_label: { type: "string" },
        zone_name: { type: "string" },
      },
      required: ["type"],
    },
  },
  {
    name: "place_order",
    description: "Create the order from the current cart and fulfillment choice. For dine_in this will fail unless set_fulfillment already succeeded in capturing a table — always call set_fulfillment with a table first and confirm it with the customer before calling this.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        payment_method: { type: "string", enum: ["pay_on_fulfillment", "online"] },
        notes: { type: "string" },
        address_line1: { type: "string" },
        address_city: { type: "string" },
      },
      required: ["payment_method"],
    },
  },
  {
    name: "request_human_handoff",
    description: "Stop and hand off to a human staff member — use this for complaints, refund disputes, or anything you're not confident handling.",
    parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
  },
];

export function toolDefinitions(): AIToolDefinition[] {
  return TOOL_DEFINITIONS;
}

type ConversationState = {
  fulfillment_type: "pickup" | "delivery" | "dine_in" | null;
  table_session_id: string | null;
  delivery_zone_id: string | null;
};

async function getConversationState(tenantId: string, conversationId: string): Promise<ConversationState> {
  const { data } = await serviceClient()
    .from("ai_conversations")
    .select("fulfillment_type, table_session_id, delivery_zone_id")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();
  return {
    fulfillment_type: (data?.fulfillment_type as ConversationState["fulfillment_type"]) ?? null,
    table_session_id: data?.table_session_id ?? null,
    delivery_zone_id: data?.delivery_zone_id ?? null,
  };
}

type VariantResolution =
  | { error: string }
  | { product: ProductDetail; variant: ProductDetail["variants"][number] };

async function resolveVariant(ctx: ToolContext, slug: string, options?: Record<string, string>): Promise<VariantResolution> {
  const product = await getProduct(ctx.tenant, ctx.locale, slug);
  if (!product) return { error: `No product found with slug "${slug}".` };
  if (product.variants.length === 1 || !options || Object.keys(options).length === 0) {
    const variant = defaultVariant(product.variants);
    if (!variant) return { error: "That product has no purchasable variant right now." };
    return { product, variant };
  }
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    const chosen = options[option.name];
    if (!chosen) continue;
    const match = option.values.find((v) => v.label.toLowerCase() === chosen.toLowerCase());
    if (match) selection[option.id] = match.id;
  }
  const variant = findVariant(product.variants, selection) ?? defaultVariant(product.variants);
  if (!variant) {
    const optionList = product.options.map((o) => `${o.name}: ${o.values.map((v) => v.label).join(", ")}`).join("; ");
    return { error: `I need to know which option to pick. Available: ${optionList}` };
  }
  return { product, variant };
}

export async function executeTool(name: string, rawArgs: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_products": {
        const { total, items } = await getCatalog(
          { tenant: ctx.tenant, locale: ctx.locale },
          { q: typeof rawArgs.query === "string" ? rawArgs.query : undefined, category: typeof rawArgs.category === "string" ? rawArgs.category : undefined, limit: typeof rawArgs.limit === "number" ? rawArgs.limit : 10 },
        );
        if (total === 0) return { content: "No matching products were found in the catalog." };
        return {
          content: JSON.stringify(
            items.map((i) => ({
              slug: i.href.replace(/^\/products\//, ""),
              name: i.name,
              price_minor: i.price.amountMinor.toString(),
              starting_from: i.price.from ?? false,
              currency: i.price.currency,
              availability: i.availability,
            })),
          ),
        };
      }

      case "get_product_details": {
        const slug = String(rawArgs.slug ?? "");
        const product = await getProduct(ctx.tenant, ctx.locale, slug);
        if (!product) return { content: `No product found with slug "${slug}".`, isError: true };
        return {
          content: JSON.stringify({
            name: product.name,
            description: product.description,
            options: product.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.label) })),
            variants: product.variants.map((v) => ({ price_minor: v.priceMinor, availability: v.availability, options: v.optionValueIds })),
          }),
        };
      }

      case "view_cart": {
        const cart = await getCart(ctx.tenant, ctx.locale, ctx.cartTokenHash);
        return {
          content: JSON.stringify({
            items: cart.items.map((i) => ({ name: i.name, qty: i.qty, line_total: i.lineTotalMinor.toString() })),
            subtotal: cart.subtotalMinor.toString(),
          }),
        };
      }

      case "add_to_cart":
      case "update_cart_item": {
        const slug = String(rawArgs.slug ?? "");
        const qty = Number(rawArgs.quantity ?? 0);
        const options = (rawArgs.options as Record<string, string> | undefined) ?? undefined;
        const resolved = await resolveVariant(ctx, slug, options);
        if ("error" in resolved) return { content: resolved.error, isError: true };
        const { error, data } = await serviceClient().rpc("cart_update", {
          p_tenant: ctx.tenant.id,
          p_token_hash: ctx.cartTokenHash,
          p_variant: resolved.variant.id,
          p_qty: qty,
          p_mode: name === "add_to_cart" ? "add" : "set",
        });
        if (error) return { content: error.message === "out_of_stock" ? "That item is out of stock." : "That item isn't available.", isError: true };
        const cart = data as { item_count?: number; limited?: boolean };
        return {
          content: `${resolved.product.name} is now in the cart. Cart has ${cart.item_count ?? 0} item(s) total.${cart.limited ? " Only limited stock was available, so the quantity was capped." : ""}`,
        };
      }

      case "set_fulfillment": {
        const type = rawArgs.type as "pickup" | "delivery" | "dine_in" | undefined;
        if (type === "dine_in") {
          const label = String(rawArgs.table_label ?? "").trim();
          if (!label) return { content: "I need a table number to seat a dine-in order.", isError: true };
          // storefront_find_table is service_role-only — the AI acts on the
          // platform's behalf here, not as the anonymous browser client.
          const { data: found } = await serviceClient().rpc("storefront_find_table", {
            p_tenant: ctx.tenant.id,
            p_label: label,
          });
          if (!found) return { content: `I couldn't find a table called "${label}". Could you double-check the number?`, isError: true };
          const foundTable = found as { id: string; label: string };
          const { data: sessionId, error } = await serviceClient().rpc("storefront_open_table_session", {
            p_tenant: ctx.tenant.id,
            p_table: foundTable.id,
          });
          if (error || !sessionId) return { content: "I couldn't seat that table right now — please try again.", isError: true };
          await serviceClient()
            .from("ai_conversations")
            .update({ fulfillment_type: "dine_in", table_session_id: sessionId, delivery_zone_id: null })
            .eq("tenant_id", ctx.tenant.id)
            .eq("id", ctx.conversationId);
          return { content: `Table set to "${foundTable.label}". Confirm this with the customer before placing the order.` };
        }
        if (type === "delivery") {
          const zoneName = String(rawArgs.zone_name ?? "").trim();
          const options = await getCheckoutOptions(ctx.tenant, ctx.locale);
          const zone = zoneName ? options.zones.find((z) => z.name.toLowerCase() === zoneName.toLowerCase()) : options.zones[0];
          if (!zone) return { content: "I couldn't match that delivery area. Available areas: " + options.zones.map((z) => z.name).join(", "), isError: true };
          await serviceClient()
            .from("ai_conversations")
            .update({ fulfillment_type: "delivery", table_session_id: null, delivery_zone_id: zone.id })
            .eq("tenant_id", ctx.tenant.id)
            .eq("id", ctx.conversationId);
          return { content: `Delivery area set to "${zone.name}".` };
        }
        await serviceClient()
          .from("ai_conversations")
          .update({ fulfillment_type: "pickup", table_session_id: null, delivery_zone_id: null })
          .eq("tenant_id", ctx.tenant.id)
          .eq("id", ctx.conversationId);
        return { content: "Fulfillment set to pickup." };
      }

      case "place_order": {
        const state = await getConversationState(ctx.tenant.id, ctx.conversationId);
        if (!state.fulfillment_type) {
          return { content: "The fulfillment type (pickup, delivery, or dine-in) hasn't been set yet — ask the customer and call set_fulfillment first.", isError: true };
        }
        // Defense in depth: the database's own CHECK constraint already makes
        // this impossible, but failing here gives a much better message than
        // a raw database error would.
        if (state.fulfillment_type === "dine_in" && !state.table_session_id) {
          return { content: "No table has been captured for this dine-in order yet — ask for the table number and call set_fulfillment before placing the order.", isError: true };
        }

        const str = (v: unknown): string => (typeof v === "string" ? v : "");
        const accessToken = newToken();
        const base = {
          fulfillment: state.fulfillment_type,
          payment_method: rawArgs.payment_method === "online" ? "online" : "pay_on_fulfillment",
          notes: typeof rawArgs.notes === "string" ? rawArgs.notes : undefined,
          locale: ctx.locale,
          access_token_hash: hashToken(accessToken),
        };
        const checkout =
          state.fulfillment_type === "dine_in"
            ? {
                ...base,
                table_session_id: state.table_session_id,
                contact: str(rawArgs.email) ? { name: str(rawArgs.name), email: str(rawArgs.email), phone: str(rawArgs.phone) } : null,
              }
            : state.fulfillment_type === "delivery"
              ? {
                  ...base,
                  contact: { name: str(rawArgs.name), email: str(rawArgs.email), phone: str(rawArgs.phone) },
                  zone_id: state.delivery_zone_id,
                  address: { line1: str(rawArgs.address_line1), city: str(rawArgs.address_city) },
                }
              : { ...base, contact: { name: str(rawArgs.name), email: str(rawArgs.email), phone: str(rawArgs.phone) } };

        const { data, error } = await serviceClient().rpc("create_order_from_cart", {
          p_tenant: ctx.tenant.id,
          p_token_hash: ctx.cartTokenHash,
          p_checkout: checkout,
        });
        if (error || !data) {
          if (error?.message === "table_required") {
            return { content: "That table isn't valid anymore — please ask for the table number again.", isError: true };
          }
          return { content: `I couldn't place the order (${error?.message ?? "unknown error"}). Please check the details and try again, or ask for a human.`, isError: true };
        }

        const order = data as { order_id: string; order_number: string; status: string; payment_method: string; total_minor: string | number };
        await serviceClient()
          .from("ai_conversations")
          .update({ status: "ended", ended_at: new Date().toISOString(), order_id: order.order_id })
          .eq("tenant_id", ctx.tenant.id)
          .eq("id", ctx.conversationId);

        const orderUrl = `${storefrontOrigin(ctx.tenant)}/${ctx.locale}/orders/${order.order_number}?t=${accessToken}`;
        if (typeof rawArgs.email === "string" && rawArgs.email) {
          await notifyOrderPlaced({
            tenantId: ctx.tenant.id,
            orderNumber: order.order_number,
            customerEmail: rawArgs.email,
            locale: ctx.locale,
            businessName: ctx.tenant.business_name,
            currency: ctx.tenant.currency,
            currencyExponent: ctx.tenant.currency_exponent,
            totalMinor: BigInt(order.total_minor),
            orderUrl,
          });
        }
        if (order.payment_method === "pay_on_fulfillment") {
          await notifyNewOrderStaff({
            tenantId: ctx.tenant.id,
            businessName: ctx.tenant.business_name,
            orderNumber: order.order_number,
            orderId: order.order_id,
            consoleUrl: `${consoleOrigin()}/${ctx.locale}/t/${ctx.tenant.slug}/orders/${order.order_id}`,
            customerName: typeof rawArgs.name === "string" ? rawArgs.name : "Guest",
            fulfillment: state.fulfillment_type === "dine_in" ? "pickup" : state.fulfillment_type,
            totalMinor: BigInt(order.total_minor),
            currency: ctx.tenant.currency,
            currencyExponent: ctx.tenant.currency_exponent,
          });
        }

        return {
          content: JSON.stringify({
            order_number: order.order_number,
            status: order.status,
            payment_method: order.payment_method,
            total_minor: String(order.total_minor),
            tracking_url: order.payment_method === "pay_on_fulfillment" || order.status !== "pending_payment" ? orderUrl : null,
            requires_payment: order.status === "pending_payment",
          }),
        };
      }

      case "request_human_handoff": {
        await serviceClient()
          .from("ai_conversations")
          .update({ status: "handed_off" })
          .eq("tenant_id", ctx.tenant.id)
          .eq("id", ctx.conversationId);
        const contact = [ctx.tenant.phone, ctx.tenant.email].filter(Boolean).join(" or ");
        return { content: contact ? `Handed off to staff. Contact: ${contact}.` : "Handed off to staff." };
      }

      default:
        return { content: `Unknown tool "${name}".`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : "Something went wrong.", isError: true };
  }
}

export { pickLocalized, ensureCartTokenHash };
