import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

/**
 * Baseline security headers for every response. A nonce-based script CSP is
 * added in Phase 14 once payment-provider origins are known.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/**
 * Request body limits for uploads through Server Actions (photos are up to
 * 8 MB each, several per request). Both the action parser and the proxy's
 * body buffer must allow it.
 */
const MAX_ACTION_BODY = "20mb";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: MAX_ACTION_BODY },
    proxyClientMaxBodySize: MAX_ACTION_BODY,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Only for the local Supabase stack in development (127.0.0.1). The hosted
    // project is public, so production never enables local-IP fetching (SSRF).
    dangerouslyAllowLocalIP: supabaseUrl !== null && ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname),
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
