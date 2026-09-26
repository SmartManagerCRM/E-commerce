"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/validation/common";
import { actionContext } from "@/server/admin/guards";
import { catalogError } from "@/server/catalog/admin";
import { createUserClient } from "@/server/supabase/clients";

const PATH = "/console/[locale]/t/[tenant]/settings/payments";
const checked = (formData: FormData, name: string) => formData.get(name) === "on";

const schema = z.object({
  mode: z.enum(["test", "live"]),
  publishable_key: z.string().trim().min(1).max(200),
  secret_key: z.string().trim().max(200),
  webhook_secret: z.string().trim().max(200),
  method_card: z.boolean(),
  method_mada: z.boolean(),
  method_stcpay: z.boolean(),
  is_active: z.boolean(),
});

const ERROR_MAP: Record<string, string> = {
  invalid_provider: "invalid",
  invalid_publishable_key: "invalidPublishableKey",
  secret_key_required: "secretKeyRequired",
  webhook_secret_required: "webhookSecretRequired",
  "42501": "forbidden",
};

/**
 * Saves Moyasar test/live keys. Leaving the secret key or webhook secret
 * blank keeps the one already stored — the owner never has to re-paste a
 * working key just to change something else.
 */
export async function savePaymentProvider(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "settings.write");
  if (!context) return { status: "error", error: "forbidden" };

  const parsed = schema.safeParse({
    mode: String(formData.get("mode") ?? "test"),
    publishable_key: String(formData.get("publishable_key") ?? ""),
    secret_key: String(formData.get("secret_key") ?? ""),
    webhook_secret: String(formData.get("webhook_secret") ?? ""),
    method_card: checked(formData, "method_card"),
    method_mada: checked(formData, "method_mada"),
    method_stcpay: checked(formData, "method_stcpay"),
    is_active: checked(formData, "is_active"),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  const input = parsed.data;
  const methods = [
    input.method_card ? "creditcard" : null,
    input.method_mada ? "mada" : null,
    input.method_stcpay ? "stcpay" : null,
  ].filter((m): m is string => Boolean(m));
  if (input.is_active && methods.length === 0) return { status: "error", error: "needMethod" };

  const supabase = await createUserClient();
  const { error } = await supabase.rpc("save_payment_provider", {
    p_tenant: context.tenant.id,
    p_provider: "moyasar",
    p_mode: input.mode,
    p_publishable_key: input.publishable_key,
    p_secret_key: input.secret_key,
    p_webhook_secret: input.webhook_secret,
    p_methods: methods,
    p_is_active: input.is_active,
  });
  if (error) return { status: "error", error: ERROR_MAP[error.message] ?? catalogError(error.code) };
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}
