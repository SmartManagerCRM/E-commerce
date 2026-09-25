import type { NextRequest } from "next/server";

import { createUserClient } from "@/server/supabase/clients";

/**
 * OAuth / magic-link / email-confirmation callback (PKCE code exchange).
 * `next` must be a same-origin relative path to prevent open redirects;
 * redirects are relative so they stay on the visitor's host behind a proxy.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = /^\/(?![/\\])[^\s]*$/.test(next) ? next : "/";

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(safeNext);
  }
  return redirectTo("/login?error=callback");
}

function redirectTo(location: string) {
  return new Response(null, { status: 307, headers: { Location: location, "Cache-Control": "no-store" } });
}
