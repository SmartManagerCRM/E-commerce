import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env.public";
import type { SiteTarget } from "@/lib/hosts";
import { storefrontTenantSchema, type StorefrontTenant } from "@/lib/tenant";
import type { Database } from "@/types/database";

/**
 * Tenant resolver: storefront lookup (slug or custom hostname) → tenant.
 *
 * Uses only the anonymous key and the `resolve_storefront` RPC, which returns
 * public fields. Results are cached in-process with a short TTL so the proxy
 * does not hit the database on every request. Domain or status changes are
 * picked up within `TTL_MS` (or immediately via `invalidateTenantCache`).
 *
 * This module intentionally avoids `server-only` because the proxy imports it.
 */
const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

type CacheEntry = { value: StorefrontTenant | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

const client = createClient<Database>(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Lookup = Extract<SiteTarget, { kind: "storefront" }>["lookup"];

function cacheKey(lookup: Lookup): string {
  return lookup.by === "slug" ? `slug:${lookup.slug}` : `host:${lookup.hostname}`;
}

export async function resolveStorefrontTenant(lookup: Lookup): Promise<StorefrontTenant | null> {
  const key = cacheKey(lookup);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const { data, error } = await client.rpc(
    "resolve_storefront",
    lookup.by === "slug" ? { p_slug: lookup.slug } : { p_hostname: lookup.hostname },
  );
  if (error) {
    // Do not cache failures: a transient outage must not pin a 404.
    throw new Error(`Tenant resolution failed: ${error.message}`);
  }

  let value: StorefrontTenant | null = null;
  if (data !== null) {
    const parsed = storefrontTenantSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Tenant resolution returned an unexpected shape: ${parsed.error.message}`);
    }
    value = parsed.data;
  }

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { value, expiresAt: now + (value ? TTL_MS : NEGATIVE_TTL_MS) });
  return value;
}

export function invalidateTenantCache(): void {
  cache.clear();
}
