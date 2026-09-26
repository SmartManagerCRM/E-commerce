/**
 * In-process sliding-window rate limiter. Sufficient for a single Node
 * process (Hostinger Business); swap for a shared store (Redis/DB) when
 * running several instances.
 */
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    return { ok: false, retryAfterMs: windowMs - (now - bucket.hits[0]) };
  }
  bucket.hits.push(now);
  if (buckets.size >= MAX_KEYS) buckets.clear();
  buckets.set(key, bucket);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/** Client IP as forwarded by the reverse proxy (first hop), for rate-limit keys only. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
