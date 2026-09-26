import { NextResponse } from "next/server";

import { hashToken } from "@/server/commerce/cart-cookie";
import { getCustomerOrder } from "@/server/commerce/storefront";
import { resumeOrCreatePayment } from "@/server/payments/service";
import { requireStorePage } from "@/server/storefront/page-tenant";
import { storefrontOrigin } from "@/server/tenant/urls";

type Params = { tenant: string; locale: string; number: string };

/**
 * Opens (or re-opens) the hosted payment session for an online order that is
 * still `pending_payment`. This is where `placeOrder` sends the customer
 * right after checkout, and where the order status page links back to if
 * they left before paying. Never issues a second live session — an existing
 * unpaid one is resumed, not duplicated.
 */
export async function GET(request: Request, { params }: { params: Promise<Params> }) {
  const { tenant: slug, locale: rawLocale, number } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const token = new URL(request.url).searchParams.get("t");
  const orderPage = (suffix = "") => NextResponse.redirect(`${storefrontOrigin(tenant)}/${locale}/orders/${number}${suffix}`);

  if (!token || !/^[\w-]{40,64}$/.test(token)) return orderPage();
  const order = await getCustomerOrder(tenant, locale, number, hashToken(token));
  if (!order || !order.id) return orderPage();

  // Already resolved one way or another: just show the status page.
  if (order.status !== "pending_payment") return orderPage(`?t=${token}`);
  if (order.expiresAt && new Date(order.expiresAt).getTime() < Date.now()) return orderPage(`?t=${token}`);

  const callbackUrl = `${storefrontOrigin(tenant)}/${locale}/orders/${number}/pay/return?t=${token}`;
  const result = await resumeOrCreatePayment(
    tenant.id,
    {
      id: order.id,
      number: order.number,
      totalMinor: order.totalMinor,
      currency: order.currency,
      description: `${tenant.business_name} — Order #${order.number}`,
      paymentIntentRef: order.paymentIntentRef,
    },
    callbackUrl,
  );
  if (result.kind === "redirect") return NextResponse.redirect(result.url);
  if (result.kind === "paid") return orderPage(`?t=${token}`);
  return orderPage(`?t=${token}&payment=unavailable`);
}
