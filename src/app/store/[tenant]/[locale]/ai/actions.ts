"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { isLocale } from "@/i18n/locales";
import { runOrderingAgentTurn } from "@/server/ai/ordering-agent";
import { ensureCartTokenHash } from "@/server/commerce/cart-cookie";
import { clientIp, rateLimit } from "@/server/security/rate-limit";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";

/**
 * The storefront chat's only server entry point. The browser sends free text
 * and (after the first turn) a conversation id it was handed back — nothing
 * else. Tenant, cart, and fulfillment/table state are all resolved and
 * validated server-side, the same guest-checkout trust boundary every other
 * storefront action already uses.
 */
const chatInput = z.object({
  message: z.string().trim().min(1).max(1000),
  conversationId: z.uuid().nullable(),
});

export type ChatResult =
  | { status: "success"; conversationId: string; reply: string; ended: boolean }
  | { status: "error"; error: "rateLimited" | "unavailable" | "invalid" };

export async function sendChatMessage(input: { message: string; conversationId: string | null }): Promise<ChatResult> {
  const parsed = chatInput.safeParse(input);
  if (!parsed.success) return { status: "error", error: "invalid" };

  const ip = clientIp(await headers());
  if (!rateLimit(`ai-chat:${ip}`, 20, 60_000).ok) return { status: "error", error: "rateLimited" };

  const tenant = await requestStorefrontTenant();
  if (!tenant) return { status: "error", error: "unavailable" };

  const locale = await getLocale();
  const cartTokenHash = await ensureCartTokenHash();

  const result = await runOrderingAgentTurn({
    tenant,
    locale: isLocale(locale) ? locale : tenant.default_language,
    cartTokenHash,
    conversationId: parsed.data.conversationId,
    message: parsed.data.message,
  });

  if (result.status === "unavailable") return { status: "error", error: "unavailable" };
  return {
    status: "success",
    conversationId: result.conversationId,
    reply: result.reply,
    ended: result.conversationStatus !== "open",
  };
}
