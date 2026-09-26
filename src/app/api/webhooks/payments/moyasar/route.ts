import { NextResponse } from "next/server";

import { applyWebhookEvent } from "@/server/payments/service";

/**
 * Moyasar webhook: the safety net alongside the customer's return page.
 * Both call the same idempotent `confirm_online_payment`, so whichever
 * arrives first wins and the other is a no-op. Always answers quickly so
 * the provider does not retry-storm a slow handler.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const { handled } = await applyWebhookEvent("moyasar", rawBody, request.headers);
  // 200 either way: an unhandled event (unknown reference, bad signature,
  // event for an order that isn't ours) is not a delivery failure to retry.
  return NextResponse.json({ handled }, { status: 200 });
}
