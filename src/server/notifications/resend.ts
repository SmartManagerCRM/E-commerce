import "server-only";

import { serverEnv } from "@/server/env";

/**
 * Minimal Resend client: server code sending transactional email. Without
 * both RESEND_API_KEY and RESEND_FROM_EMAIL configured, sending is simply
 * unavailable — callers are expected to check `emailConfigured()` and skip
 * (never fake a send).
 */
export function emailConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

export type SendEmailInput = { to: string; subject: string; html: string; text: string; replyTo?: string };
export type SendEmailResult = { ok: true; messageId: string } | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return { ok: false, error: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) return { ok: false, error: body?.message ?? `Resend error ${res.status}` };
    if (!body?.id) return { ok: false, error: "no_message_id" };
    return { ok: true, messageId: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}
