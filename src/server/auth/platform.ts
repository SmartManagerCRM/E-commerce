import "server-only";

import { notFound } from "next/navigation";

import type { Locale } from "@/i18n/locales";

import { getSessionUser, isPlatformAdmin, requireUser, type SessionUser } from "./session";

/** Guard for Super Admin pages: signed out → login; not a platform admin → 404. */
export async function requirePlatformAdmin(locale: Locale): Promise<SessionUser> {
  const user = await requireUser(locale);
  if (!(await isPlatformAdmin(user.id))) notFound();
  return user;
}

/** Guard for Super Admin Server Actions. */
export async function platformActionUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && (await isPlatformAdmin(user.id)) ? user : null;
}
