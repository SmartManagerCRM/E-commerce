"use server";

import { redirect as redirectTo } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { safeRelativePath } from "@/lib/safe-path";
import { createUserClient } from "@/server/supabase/clients";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export type SignInState = { error: "invalid" | "invalidInput" | "rateLimited" | null };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase Auth applies its own rate limits; surface them distinctly.
    return { error: error.status === 429 ? "rateLimited" : "invalid" };
  }

  // `next` is a full public path including the locale (e.g. /en/invite/…).
  const next = safeRelativePath(formData.get("next"), "");
  if (next) redirectTo(next);
  redirect({ href: "/", locale: await getLocale() });
  return { error: null };
}

export async function signOut(): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale: await getLocale() });
}
