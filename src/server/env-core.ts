import { z } from "zod";

/**
 * Server environment schema. Application code imports `@/server/env`
 * (guarded by `server-only`); the proxy imports this module directly because
 * the proxy bundle cannot load `server-only`. Non-`NEXT_PUBLIC_` variables are
 * never inlined into browser bundles by Next.js.
 */
const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.-]+$/, "must be a bare hostname without scheme or port");

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Root domain of the platform, e.g. `e-commerce.smartmanager.me` (`localhost` in development). */
  PLATFORM_ROOT_DOMAIN: hostname.default("localhost"),
  /** Subdomain of the root domain that serves the admin console and Super Admin. */
  CONSOLE_SUBDOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("app"),
  /** Supabase secret (service-role) key. Only used by narrowly scoped server services. */
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  /** Public origin scheme; `https` in production. */
  PUBLIC_URL_SCHEME: z.enum(["http", "https"]).default("https"),
  /**
   * What tenants point their custom domain at (shown in DNS instructions),
   * e.g. the Hostinger server IP or hostname.
   */
  STOREFRONT_DNS_TARGET: z.string().trim().min(1).optional(),
  /** Optional port appended to generated URLs in development (e.g. `3000`). */
  PUBLIC_URL_PORT: z.string().regex(/^\d+$/).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
