import "server-only";

/**
 * Online payments. The real implementation already lives in
 * `@/server/payments/service` (provider-agnostic, Vault-backed secrets,
 * idempotent confirmation) — this module just re-exports it under the same
 * `services/*` namespace as the rest of the commerce surface, so a caller
 * (the console/storefront today, an AI tool-calling layer later) has one
 * place to import every capability from.
 */
export { initiatePayment, resumeOrCreatePayment, verifyReturn, applyWebhookEvent } from "@/server/payments/service";
export type { InitiatePaymentResult, ResumeResult, VerifyReturnResult } from "@/server/payments/service";
