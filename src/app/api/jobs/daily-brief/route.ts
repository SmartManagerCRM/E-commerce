import { NextResponse } from "next/server";

import { isLocale } from "@/i18n/locales";
import { notifyDailyBrief } from "@/server/notifications/notify";
import { serverEnv } from "@/server/env";
import { serviceClient } from "@/server/supabase/clients";
import { consoleOrigin } from "@/server/tenant/urls";

/**
 * Sends the daily brief to every tenant that's due one right now (enabled,
 * has a recipient, and hasn't already gotten today's — in ITS OWN time zone,
 * per `tenants_due_daily_brief()`). Idempotency lives in the database
 * (`notification_daily_briefs`), not in how often this route is called, so a
 * cron running hourly (Hostinger cron / systemd timer, as documented in
 * ARCHITECTURE.md §36) just needs to run "sometime during the tenant's
 * morning" — calling it twice in the same tenant-day is a safe no-op.
 */
export async function POST(request: Request) {
  const secret = serverEnv().JOBS_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = serviceClient();
  const { data: due, error } = await client.rpc("tenants_due_daily_brief");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { tenant_id: string; sent: boolean }[] = [];
  for (const row of due ?? []) {
    const { data: summary } = await client.rpc("daily_brief_summary", { p_tenant: row.tenant_id });
    if (!summary) continue;
    const locale = isLocale(row.locale) ? row.locale : "en";
    const sent = await notifyDailyBrief({
      tenantId: row.tenant_id,
      businessName: row.business_name,
      recipientEmail: row.recipient_email,
      consoleUrl: `${consoleOrigin()}/${locale}/t/${row.slug}`,
      currency: row.currency,
      currencyExponent: row.currency_exponent,
      summary: summary as {
        orders: number;
        revenue_minor: number;
        new_customers: number;
        open_orders: number;
        low_stock: number;
      },
    });
    // Record the day as done in the tenant's own local date regardless of send
    // success — a transient email failure shouldn't retry-storm every run;
    // it's already logged in `notifications` with the failure reason.
    await client.from("notification_daily_briefs").insert({ tenant_id: row.tenant_id, sent_on: row.today });
    results.push({ tenant_id: row.tenant_id, sent });
  }

  return NextResponse.json({ processed: results.length, results });
}
