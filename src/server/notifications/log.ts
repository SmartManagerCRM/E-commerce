import "server-only";

import { serviceClient } from "@/server/supabase/clients";
import type { Json } from "@/types/database";

export type NotificationTemplate =
  | "order_placed"
  | "order_status_changed"
  | "payment_received"
  | "new_order_staff"
  | "staff_invited"
  | "owner_invited"
  | "daily_brief"
  | "booking_requested"
  | "booking_status_changed"
  | "new_booking_staff";

export async function logNotification(entry: {
  tenantId: string;
  template: NotificationTemplate;
  recipientEmail: string | null;
  recipientCustomerId?: string | null;
  subject: string;
  payload?: Record<string, unknown>;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
  providerMessageId?: string | null;
}): Promise<void> {
  await serviceClient()
    .from("notifications")
    .insert({
      tenant_id: entry.tenantId,
      template: entry.template,
      recipient_email: entry.recipientEmail,
      recipient_customer_id: entry.recipientCustomerId ?? null,
      subject: entry.subject,
      payload: (entry.payload ?? {}) as NonNullable<Json>,
      status: entry.status,
      error: entry.error ?? null,
      provider_message_id: entry.providerMessageId ?? null,
    });
}
