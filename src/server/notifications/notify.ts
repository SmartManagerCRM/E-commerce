import "server-only";

import type { Locale } from "@/i18n/locales";
import type { Fulfillment, OrderStatus } from "@/lib/commerce/orders";
import { emailConfigured, sendEmail } from "@/server/notifications/resend";
import { serviceClient } from "@/server/supabase/clients";

import {
  dailyBriefEmail,
  newOrderStaffEmail,
  orderPlacedEmail,
  orderStatusChangedEmail,
  ownerInvitedEmail,
  paymentReceivedEmail,
  staffInvitedEmail,
} from "./templates";
import { logNotification, type NotificationTemplate } from "./log";

/** Order-email + daily-brief toggles and the owner-facing recipient address. */
async function notificationSettings(tenantId: string): Promise<{ orderEmails: boolean; recipientEmail: string | null }> {
  const { data } = await serviceClient().rpc("notification_settings", { p_tenant: tenantId });
  const row = (data ?? {}) as { order_emails?: boolean; recipient_email?: string | null };
  return { orderEmails: row.order_emails !== false, recipientEmail: row.recipient_email ?? null };
}

async function deliver(args: {
  tenantId: string;
  template: NotificationTemplate;
  to: string | null;
  recipientCustomerId?: string | null;
  subject: string;
  html: string;
  text: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!args.to) {
    await logNotification({
      tenantId: args.tenantId,
      template: args.template,
      recipientEmail: null,
      recipientCustomerId: args.recipientCustomerId,
      subject: args.subject,
      status: "skipped",
      error: "no_recipient",
      payload: args.payload,
    });
    return;
  }
  if (!emailConfigured()) {
    await logNotification({
      tenantId: args.tenantId,
      template: args.template,
      recipientEmail: args.to,
      recipientCustomerId: args.recipientCustomerId,
      subject: args.subject,
      status: "skipped",
      error: "not_configured",
      payload: args.payload,
    });
    return;
  }
  const result = await sendEmail({ to: args.to, subject: args.subject, html: args.html, text: args.text });
  await logNotification({
    tenantId: args.tenantId,
    template: args.template,
    recipientEmail: args.to,
    recipientCustomerId: args.recipientCustomerId,
    subject: args.subject,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    providerMessageId: result.ok ? result.messageId : null,
    payload: args.payload,
  });
}

type OrderContext = {
  tenantId: string;
  orderNumber: string;
  customerEmail: string;
  customerId?: string | null;
  locale: Locale;
  businessName: string;
  currency: string;
  currencyExponent: number;
};

/** Sent right after checkout, when the raw order-tracking token is still in hand. */
export async function notifyOrderPlaced(order: OrderContext & { totalMinor: bigint; orderUrl: string }): Promise<void> {
  const settings = await notificationSettings(order.tenantId);
  if (!settings.orderEmails) return;
  const email = orderPlacedEmail({
    locale: order.locale,
    businessName: order.businessName,
    orderNumber: order.orderNumber,
    orderUrl: order.orderUrl,
    totalMinor: order.totalMinor,
    currency: order.currency,
    exponent: order.currencyExponent,
  });
  await deliver({
    tenantId: order.tenantId,
    template: "order_placed",
    to: order.customerEmail,
    recipientCustomerId: order.customerId,
    subject: email.subject,
    html: email.html,
    text: email.text,
    payload: { order_number: order.orderNumber },
  });
}

/** Staff-triggered: no order link (only the token's hash is ever stored). */
export async function notifyOrderStatusChanged(order: OrderContext & { status: OrderStatus }): Promise<void> {
  const settings = await notificationSettings(order.tenantId);
  if (!settings.orderEmails) return;
  const email = orderStatusChangedEmail({
    locale: order.locale,
    businessName: order.businessName,
    orderNumber: order.orderNumber,
    status: order.status,
  });
  await deliver({
    tenantId: order.tenantId,
    template: "order_status_changed",
    to: order.customerEmail,
    recipientCustomerId: order.customerId,
    subject: email.subject,
    html: email.html,
    text: email.text,
    payload: { order_number: order.orderNumber, status: order.status },
  });
}

/** Either a staff-recorded manual payment, or an online payment confirming — neither has the raw token on hand. */
export async function notifyPaymentReceived(order: OrderContext & { totalMinor: bigint }): Promise<void> {
  const settings = await notificationSettings(order.tenantId);
  if (!settings.orderEmails) return;
  const email = paymentReceivedEmail({
    locale: order.locale,
    businessName: order.businessName,
    orderNumber: order.orderNumber,
    totalMinor: order.totalMinor,
    currency: order.currency,
    exponent: order.currencyExponent,
  });
  await deliver({
    tenantId: order.tenantId,
    template: "payment_received",
    to: order.customerEmail,
    recipientCustomerId: order.customerId,
    subject: email.subject,
    html: email.html,
    text: email.text,
    payload: { order_number: order.orderNumber },
  });
}

/** Alerts the store when an order becomes real (placed and payable, or paid). */
export async function notifyNewOrderStaff(input: {
  tenantId: string;
  businessName: string;
  orderNumber: string;
  orderId: string;
  consoleUrl: string;
  customerName: string;
  fulfillment: Fulfillment;
  totalMinor: bigint;
  currency: string;
  currencyExponent: number;
}): Promise<void> {
  const settings = await notificationSettings(input.tenantId);
  if (!settings.orderEmails) return;
  const email = newOrderStaffEmail({
    businessName: input.businessName,
    orderNumber: input.orderNumber,
    consoleUrl: input.consoleUrl,
    customerName: input.customerName,
    fulfillment: input.fulfillment,
    totalMinor: input.totalMinor,
    currency: input.currency,
    exponent: input.currencyExponent,
  });
  await deliver({
    tenantId: input.tenantId,
    template: "new_order_staff",
    to: settings.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    payload: { order_number: input.orderNumber, order_id: input.orderId },
  });
}

export async function notifyStaffInvited(input: {
  tenantId: string;
  businessName: string;
  email: string;
  roleLabel: string;
  inviteUrl: string;
}): Promise<void> {
  const email = staffInvitedEmail({ businessName: input.businessName, roleLabel: input.roleLabel, inviteUrl: input.inviteUrl });
  await deliver({
    tenantId: input.tenantId,
    template: "staff_invited",
    to: input.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function notifyOwnerInvited(input: {
  tenantId: string;
  businessName: string;
  email: string;
  inviteUrl: string;
}): Promise<void> {
  const email = ownerInvitedEmail({ businessName: input.businessName, inviteUrl: input.inviteUrl });
  await deliver({
    tenantId: input.tenantId,
    template: "owner_invited",
    to: input.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function notifyDailyBrief(input: {
  tenantId: string;
  businessName: string;
  recipientEmail: string;
  consoleUrl: string;
  currency: string;
  currencyExponent: number;
  summary: { orders: number; revenue_minor: number; new_customers: number; open_orders: number; low_stock: number };
}): Promise<boolean> {
  const email = dailyBriefEmail({
    businessName: input.businessName,
    consoleUrl: input.consoleUrl,
    orders: input.summary.orders,
    revenueMinor: BigInt(input.summary.revenue_minor),
    currency: input.currency,
    exponent: input.currencyExponent,
    newCustomers: input.summary.new_customers,
    openOrders: input.summary.open_orders,
    lowStock: input.summary.low_stock,
  });
  if (!emailConfigured()) {
    await logNotification({
      tenantId: input.tenantId,
      template: "daily_brief",
      recipientEmail: input.recipientEmail,
      subject: email.subject,
      status: "skipped",
      error: "not_configured",
    });
    return false;
  }
  const result = await sendEmail({ to: input.recipientEmail, subject: email.subject, html: email.html, text: email.text });
  await logNotification({
    tenantId: input.tenantId,
    template: "daily_brief",
    recipientEmail: input.recipientEmail,
    subject: email.subject,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    providerMessageId: result.ok ? result.messageId : null,
  });
  return result.ok;
}
