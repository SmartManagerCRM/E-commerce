import "server-only";

import type { Locale } from "@/i18n/locales";
import type { Fulfillment, OrderStatus } from "@/lib/commerce/orders";
import { formatMoney } from "@/lib/money";

/**
 * Transactional email copy. Customer- and owner-facing templates (order
 * placed, status changed, payment received, daily brief) are localized in
 * the recipient's own locale, since it's already known (the order's locale,
 * or the tenant's default language). Purely internal, staff-facing
 * templates (a new staff invitation, a platform owner invitation, "you have
 * a new order" for the store) are English-only for now — the recipient's
 * preferred language isn't known before they've ever signed in, and adding
 * three more full translations for console-internal mail is deferred.
 */
export type EmailContent = { subject: string; html: string; text: string };

const STATUS_LABEL: Record<Locale, Record<OrderStatus, string>> = {
  en: {
    pending_payment: "awaiting payment",
    pending: "received",
    confirmed: "confirmed",
    preparing: "being prepared",
    ready: "ready for pickup",
    out_for_delivery: "out for delivery",
    completed: "completed",
    cancelled: "cancelled",
  },
  fr: {
    pending_payment: "en attente de paiement",
    pending: "reçue",
    confirmed: "confirmée",
    preparing: "en préparation",
    ready: "prête pour le retrait",
    out_for_delivery: "en cours de livraison",
    completed: "terminée",
    cancelled: "annulée",
  },
  ar: {
    pending_payment: "بانتظار الدفع",
    pending: "تم الاستلام",
    confirmed: "تم التأكيد",
    preparing: "قيد التحضير",
    ready: "جاهز للاستلام",
    out_for_delivery: "قيد التوصيل",
    completed: "مكتمل",
    cancelled: "ملغى",
  },
};

const T = {
  en: {
    orderPlacedSubject: (n: string) => `Order #${n} received`,
    orderPlacedHeading: (business: string) => `Thanks for your order at ${business}!`,
    orderPlacedBody: (n: string) => `We've received order #${n} and will keep you posted.`,
    statusChangedSubject: (n: string) => `Order #${n} update`,
    statusChangedBody: (n: string, status: string) => `Your order #${n} is now ${status}.`,
    paymentReceivedSubject: (n: string) => `Payment received for order #${n}`,
    paymentReceivedBody: (n: string) => `We've received your payment for order #${n}. Thank you!`,
    total: "Total",
    viewOrder: "View your order",
    footer: (business: string) => `${business} — sent via SmartManager.`,
  },
  fr: {
    orderPlacedSubject: (n: string) => `Commande n°${n} reçue`,
    orderPlacedHeading: (business: string) => `Merci pour votre commande chez ${business} !`,
    orderPlacedBody: (n: string) => `Nous avons bien reçu votre commande n°${n} et vous tiendrons informé.`,
    statusChangedSubject: (n: string) => `Mise à jour de la commande n°${n}`,
    statusChangedBody: (n: string, status: string) => `Votre commande n°${n} est maintenant ${status}.`,
    paymentReceivedSubject: (n: string) => `Paiement reçu pour la commande n°${n}`,
    paymentReceivedBody: (n: string) => `Nous avons bien reçu votre paiement pour la commande n°${n}. Merci !`,
    total: "Total",
    viewOrder: "Voir votre commande",
    footer: (business: string) => `${business} — envoyé via SmartManager.`,
  },
  ar: {
    orderPlacedSubject: (n: string) => `تم استلام الطلب رقم ${n}`,
    orderPlacedHeading: (business: string) => `شكرًا لطلبك من ${business}!`,
    orderPlacedBody: (n: string) => `لقد استلمنا طلبك رقم ${n} وسنُبقيك على اطلاع.`,
    statusChangedSubject: (n: string) => `تحديث الطلب رقم ${n}`,
    statusChangedBody: (n: string, status: string) => `طلبك رقم ${n} الآن ${status}.`,
    paymentReceivedSubject: (n: string) => `تم استلام الدفع للطلب رقم ${n}`,
    paymentReceivedBody: (n: string) => `لقد استلمنا دفعتك للطلب رقم ${n}. شكرًا لك!`,
    total: "الإجمالي",
    viewOrder: "عرض طلبك",
    footer: (business: string) => `${business} — أُرسل عبر سمارت مانجر.`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

function wrap(locale: Locale, heading: string, bodyHtml: string, footer: string): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:system-ui,-apple-system,sans-serif;background:#f6f5f3;padding:24px 0;margin:0;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<h1 style="font-size:20px;margin:0 0 16px;">${heading}</h1>
${bodyHtml}
<p style="margin-top:32px;color:#8a8a8a;font-size:12px;">${footer}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">${label}</a></p>`;
}

export function orderPlacedEmail(input: {
  locale: Locale;
  businessName: string;
  orderNumber: string;
  orderUrl: string;
  totalMinor: bigint;
  currency: string;
  exponent: number;
}): EmailContent {
  const t = T[input.locale];
  const total = formatMoney({ amountMinor: input.totalMinor, currency: input.currency }, input.exponent, input.locale);
  const heading = t.orderPlacedHeading(input.businessName);
  const body = `<p>${t.orderPlacedBody(input.orderNumber)}</p><p><strong>${t.total}:</strong> ${total}</p>${button(input.orderUrl, t.viewOrder)}`;
  return {
    subject: t.orderPlacedSubject(input.orderNumber),
    html: wrap(input.locale, heading, body, t.footer(input.businessName)),
    text: `${heading}\n${t.orderPlacedBody(input.orderNumber)}\n${t.total}: ${total}\n${input.orderUrl}`,
  };
}

export function orderStatusChangedEmail(input: {
  locale: Locale;
  businessName: string;
  orderNumber: string;
  /** Only known right after checkout (only the token's hash is ever stored) — omitted for staff-triggered updates. */
  orderUrl?: string;
  status: OrderStatus;
}): EmailContent {
  const t = T[input.locale];
  const status = STATUS_LABEL[input.locale][input.status];
  const heading = t.statusChangedBody(input.orderNumber, status);
  const body = input.orderUrl ? button(input.orderUrl, t.viewOrder) : "";
  return {
    subject: t.statusChangedSubject(input.orderNumber),
    html: wrap(input.locale, heading, body, t.footer(input.businessName)),
    text: input.orderUrl ? `${heading}\n${input.orderUrl}` : heading,
  };
}

export function paymentReceivedEmail(input: {
  locale: Locale;
  businessName: string;
  orderNumber: string;
  /** Only known right after checkout (only the token's hash is ever stored) — omitted for staff-recorded payments. */
  orderUrl?: string;
  totalMinor: bigint;
  currency: string;
  exponent: number;
}): EmailContent {
  const t = T[input.locale];
  const total = formatMoney({ amountMinor: input.totalMinor, currency: input.currency }, input.exponent, input.locale);
  const heading = t.paymentReceivedBody(input.orderNumber);
  const body = `<p><strong>${t.total}:</strong> ${total}</p>${input.orderUrl ? button(input.orderUrl, t.viewOrder) : ""}`;
  return {
    subject: t.paymentReceivedSubject(input.orderNumber),
    html: wrap(input.locale, heading, body, t.footer(input.businessName)),
    text: `${heading}\n${t.total}: ${total}${input.orderUrl ? `\n${input.orderUrl}` : ""}`,
  };
}

export function newOrderStaffEmail(input: {
  businessName: string;
  orderNumber: string;
  consoleUrl: string;
  customerName: string;
  fulfillment: Fulfillment;
  totalMinor: bigint;
  currency: string;
  exponent: number;
}): EmailContent {
  const total = formatMoney({ amountMinor: input.totalMinor, currency: input.currency }, input.exponent, "en");
  const heading = `New order #${input.orderNumber}`;
  const body = `<p>${input.customerName} placed a ${input.fulfillment} order for ${total}.</p>${button(input.consoleUrl, "Open order")}`;
  return {
    subject: `New order #${input.orderNumber} — ${input.businessName}`,
    html: wrap("en", heading, body, `${input.businessName} — sent via SmartManager.`),
    text: `${heading}\n${input.customerName} placed a ${input.fulfillment} order for ${total}.\n${input.consoleUrl}`,
  };
}

export function staffInvitedEmail(input: { businessName: string; roleLabel: string; inviteUrl: string }): EmailContent {
  const heading = `You're invited to join ${input.businessName}`;
  const body = `<p>You've been invited as ${input.roleLabel}. Accept the invitation to set up your account.</p>${button(input.inviteUrl, "Accept invitation")}`;
  return {
    subject: `You're invited to join ${input.businessName} on SmartManager`,
    html: wrap("en", heading, body, "Sent via SmartManager."),
    text: `${heading}\nAccept: ${input.inviteUrl}`,
  };
}

export function ownerInvitedEmail(input: { businessName: string; inviteUrl: string }): EmailContent {
  const heading = `Set up ${input.businessName} on SmartManager`;
  const body = `<p>An account has been created for you to manage ${input.businessName}. Accept the invitation to set your password.</p>${button(input.inviteUrl, "Accept invitation")}`;
  return {
    subject: `Set up ${input.businessName} on SmartManager`,
    html: wrap("en", heading, body, "Sent via SmartManager."),
    text: `${heading}\nAccept: ${input.inviteUrl}`,
  };
}

export function dailyBriefEmail(input: {
  businessName: string;
  consoleUrl: string;
  orders: number;
  revenueMinor: bigint;
  currency: string;
  exponent: number;
  newCustomers: number;
  openOrders: number;
  lowStock: number;
}): EmailContent {
  const revenue = formatMoney({ amountMinor: input.revenueMinor, currency: input.currency }, input.exponent, "en");
  const heading = `Yesterday at ${input.businessName}`;
  const rows: [string, string][] = [
    ["Orders", String(input.orders)],
    ["Revenue", revenue],
    ["New customers", String(input.newCustomers)],
    ["Open orders right now", String(input.openOrders)],
    ["Low-stock items", String(input.lowStock)],
  ];
  const table = rows
    .map(([label, value]) => `<tr><td style="padding:4px 0;color:#6b6b6b;">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${value}</td></tr>`)
    .join("");
  const body = `<table style="width:100%;border-collapse:collapse;">${table}</table>${button(input.consoleUrl, "Open dashboard")}`;
  return {
    subject: `Daily brief — ${input.businessName}`,
    html: wrap("en", heading, body, "Sent via SmartManager."),
    text: `${heading}\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}\n${input.consoleUrl}`,
  };
}
