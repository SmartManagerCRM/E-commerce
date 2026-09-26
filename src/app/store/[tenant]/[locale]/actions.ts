"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { isLocale } from "@/i18n/locales";
import type { FormState } from "@/lib/validation/common";
import { emailSchema } from "@/lib/validation/common";
import { serverEnv } from "@/server/env";
import { clientIp, rateLimit } from "@/server/security/rate-limit";
import { serviceClient } from "@/server/supabase/clients";
import { requestStorefrontTenant } from "@/server/tenant/request-tenant";

const newsletterSchema = z.object({
  email: emailSchema,
  consent: z.literal("on"),
  // Honeypot: real visitors never fill this hidden field.
  company: z.string().max(0).optional().default(""),
});

/** Newsletter sign-up for the store serving this hostname (consent required). */
export async function subscribeNewsletter(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newsletterSchema.safeParse({
    email: formData.get("email"),
    consent: formData.get("consent"),
    company: formData.get("company") ?? "",
  });
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return { status: "error", error: consentMissing ? "consentRequired" : "invalidEmail" };
  }

  const ip = clientIp(await headers());
  if (!rateLimit(`newsletter:${ip}`, 5, 10 * 60_000).ok) return { status: "error", error: "rateLimited" };

  const tenant = await requestStorefrontTenant();
  if (!tenant) return { status: "error", error: "generic" };
  if (!serverEnv().SUPABASE_SECRET_KEY) return { status: "error", error: "generic" };

  const locale = await getLocale();
  const { error } = await serviceClient().rpc("newsletter_subscribe", {
    p_tenant: tenant.id,
    p_email: parsed.data.email,
    p_locale: isLocale(locale) ? locale : tenant.default_language,
  });
  if (error) return { status: "error", error: "generic" };
  return { status: "success", message: "subscribed" };
}
