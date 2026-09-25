import "server-only";

import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { createUserClient } from "@/server/supabase/clients";

export type SessionUser = { id: string; email: string | null };

/**
 * Current user, verified by Supabase Auth (JWT signature / session check).
 * Never trust user identity from anything but this.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
});

export async function requireUser(locale: Locale): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }
  return user as SessionUser;
}

export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createUserClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return data !== null;
});
