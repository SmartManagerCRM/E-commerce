import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { serverEnv } from "@/server/env";

/**
 * Guest cart identity: a random token in an HttpOnly cookie on the store's
 * own host (so every store has its own cart). Only its SHA-256 hash is stored
 * in the database, so a database leak cannot be replayed as a cart cookie.
 */
const COOKIE = "sm_cart";
const MAX_AGE = 60 * 60 * 24 * 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function cartTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && /^[\w-]{40,64}$/.test(token) ? hashToken(token) : null;
}

/** Returns the cart token hash, creating the cookie first if needed (Server Actions only). */
export async function ensureCartTokenHash(): Promise<string> {
  const existing = await cartTokenHash();
  if (existing) return existing;
  const token = newToken();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().PUBLIC_URL_SCHEME === "https",
    path: "/",
    maxAge: MAX_AGE,
  });
  return hashToken(token);
}

/** A fresh cart after checkout. */
export async function resetCartCookie() {
  (await cookies()).delete(COOKIE);
}
