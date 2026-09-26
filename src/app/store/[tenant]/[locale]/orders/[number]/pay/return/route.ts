import { NextResponse } from "next/server";

import { verifyReturn } from "@/server/payments/service";
import { requireStorePage } from "@/server/storefront/page-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

type Params = { tenant: string; locale: string; number: string };

/**
 * Moyasar redirects the customer here after the hosted payment page. Their
 * query string is never trusted for payment status: we re-fetch the payment
 * from the provider server-side (`verifyReturn`) before marking anything
 * paid, exactly as the webhook path does — both call the same idempotent
 * `confirm_online_payment`.
 */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { tenant: slug, locale: rawLocale, number } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const ref = url.searchParams.get("id");
  const orderPage = (suffix = "") => NextResponse.redirect(`${storefrontOrigin(tenant)}/${locale}/orders/${number}${suffix}`);

  if (!token || !/^[\w-]{40,64}$/.test(token)) return orderPage();
  if (!ref) return orderPage(`?t=${token}`);

  await verifyReturn(tenant.id, ref);
  return orderPage(`?t=${token}`);
}
