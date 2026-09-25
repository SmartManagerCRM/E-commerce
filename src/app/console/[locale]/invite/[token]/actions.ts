"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import type { FormState } from "@/lib/validation/common";
import { serverEnv } from "@/server/env";
import { createUserClient, serviceClient } from "@/server/supabase/clients";

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

async function acceptAndRedirect(token: string): Promise<FormState> {
  const supabase = await createUserClient();
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !slug) {
    const byCode: Record<string, string> = {
      "42501": "inviteWrongAccount",
      "23505": "inviteUsed",
      "22023": "inviteExpired",
      P0002: "inviteNotFound",
    };
    return { status: "error", error: byCode[error?.code ?? ""] ?? "generic" };
  }
  redirect({ href: `/t/${slug}`, locale: await getLocale() });
  return { status: "success" };
}

/** Signed-in user accepts an invitation addressed to their email. */
export async function acceptInvitation(token: string): Promise<FormState> {
  if (!tokenSchema.safeParse(token).success) return { status: "error", error: "inviteNotFound" };
  return acceptAndRedirect(token);
}

const signupSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120),
    password: z.string().min(10).max(200).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, { path: ["password_confirm"] });

/**
 * New invitee creates their account. The account is created for the exact
 * email the invitation was issued to (the invitation token is the proof),
 * then the invitation is accepted in the same flow.
 */
export async function createAccountFromInvitation(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!tokenSchema.safeParse(token).success) return { status: "error", error: "inviteNotFound" };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const onConfirm = parsed.error.issues.some((i) => i.path[0] === "password_confirm");
    return { status: "error", error: onConfirm ? "passwordMismatch" : "weakPassword" };
  }
  if (!serverEnv().SUPABASE_SECRET_KEY) return { status: "error", error: "serverNotConfigured" };

  const supabase = await createUserClient();
  const { data: invitation } = await supabase.rpc("get_invitation", { p_token: token });
  const inv = invitation as { email: string; expired: boolean; accepted: boolean; revoked: boolean } | null;
  if (!inv || inv.revoked) return { status: "error", error: "inviteNotFound" };
  if (inv.accepted) return { status: "error", error: "inviteUsed" };
  if (inv.expired) return { status: "error", error: "inviteExpired" };

  const { error: createError } = await serviceClient().auth.admin.createUser({
    email: inv.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, locale: await getLocale() },
  });
  if (createError) {
    const exists = createError.status === 422 || /already/i.test(createError.message);
    return { status: "error", error: exists ? "accountExists" : "generic" };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: inv.email,
    password: parsed.data.password,
  });
  if (signInError) return { status: "error", error: "generic" };

  return acceptAndRedirect(token);
}
