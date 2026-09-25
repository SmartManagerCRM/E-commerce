import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env.public";
import { serverEnv } from "@/server/env";
import type { Database } from "@/types/database";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * User-scoped client for Server Components, Server Actions and Route
 * Handlers. Carries the signed-in user's JWT, so every query is subject to
 * Row Level Security. This is the default client for all tenant data.
 */
export async function createUserClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies; the proxy refreshes the
            // session on every console request instead.
          }
        },
      },
    },
  );
}

let anonClient: TypedSupabaseClient | undefined;

/**
 * Cookie-less anonymous client for public data (storefront resolution,
 * public catalog). Subject to RLS as the `anon` role.
 */
export function anonymousClient(): TypedSupabaseClient {
  anonClient ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return anonClient;
}

/**
 * Privileged client that BYPASSES Row Level Security.
 *
 * Only for narrowly scoped server-side services (payment webhooks, platform
 * provisioning, background jobs) that validate authorization themselves.
 * Never pass its results to the client without filtering by the tenant
 * resolved on the server.
 */
export function serviceClient(): TypedSupabaseClient {
  const key = serverEnv().SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not configured; this operation requires the service role.");
  }
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
