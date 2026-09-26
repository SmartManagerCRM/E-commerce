import "server-only";

/**
 * Provider-agnostic payment interface (architecture §9). Moyasar is the
 * first (and, for now, only) implementation; Tap/Stripe can be added behind
 * the same shape without touching checkout or webhook code.
 */
export type PaymentMethodKind = "card" | "mada" | "applepay" | "stcpay";

export type ProviderSecrets = { secretKey: string; webhookSecret: string; mode: "test" | "live" };

export type CreatePaymentInput = {
  orderId: string;
  orderNumber: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  callbackUrl: string;
};

/** A hosted payment session the customer is redirected to. */
export type ProviderPaymentSession = { ref: string; redirectUrl: string };

export type ProviderPaymentStatus = {
  ref: string;
  paid: boolean;
  status: string;
  amountMinor: bigint;
  currency: string;
  method: PaymentMethodKind | null;
  /** Where to send the customer to finish paying, when not yet paid/failed. */
  redirectUrl: string | null;
};

export type VerifiedWebhookEvent = {
  eventId: string;
  ref: string;
  paid: boolean;
  status: string;
  amountMinor: bigint;
  currency: string;
  method: PaymentMethodKind | null;
};

export interface PaymentProvider {
  readonly key: "moyasar";
  supportedMethods(methods: string[]): PaymentMethodKind[];
  createPayment(input: CreatePaymentInput, secrets: ProviderSecrets): Promise<ProviderPaymentSession>;
  fetchPayment(ref: string, secrets: ProviderSecrets): Promise<ProviderPaymentStatus>;
  verifyWebhook(rawBody: string, headers: Headers, secrets: ProviderSecrets): Promise<VerifiedWebhookEvent | null>;
}
