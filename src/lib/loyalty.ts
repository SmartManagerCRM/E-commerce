/**
 * Loyalty points shared by the console UI and tests. The database
 * (`loyalty_ledger`, `loyalty_balance()`) is authoritative; this mirror only
 * names the shapes so the UI stays honest about what it's rendering.
 */
export const LOYALTY_LEDGER_REASONS = ["earned_order", "redeemed_reward", "manual_adjustment"] as const;
export type LoyaltyLedgerReason = (typeof LOYALTY_LEDGER_REASONS)[number];

export const LOYALTY_REWARD_KINDS = ["discount_percent", "discount_fixed"] as const;
export type LoyaltyRewardKind = (typeof LOYALTY_REWARD_KINDS)[number];
