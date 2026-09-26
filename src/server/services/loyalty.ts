import "server-only";

import type { LoyaltyRewardKind } from "@/lib/loyalty";
import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Staff-facing loyalty operations: program settings, tiers, rewards, and a
 * customer's points ledger. Points are earned automatically at the database
 * level (hooked into `record_order_payment`/`confirm_online_payment`) —
 * there is no "award points" function here, since nothing should ever call
 * that from outside a confirmed payment. Redemption and manual adjustments
 * are the only writes a caller makes, and both are permission-checked
 * (`marketing.write`) by the database function they wrap, not just here.
 */
export type LoyaltySettings = { active: boolean; pointsPerCurrencyUnit: number };

export async function getLoyaltySettings(context: TenantAdminContext): Promise<LoyaltySettings> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("loyalty_settings", { p_tenant: context.tenant.id });
  if (error || !data) return { active: false, pointsPerCurrencyUnit: 1 };
  const row = data as { active: boolean; points_per_currency_unit: number };
  return { active: row.active, pointsPerCurrencyUnit: row.points_per_currency_unit };
}

export type LoyaltyTierRow = {
  id: string;
  name: unknown;
  thresholdPoints: number;
  perks: string | null;
  active: boolean;
  position: number;
};

export async function listLoyaltyTiers(context: TenantAdminContext): Promise<LoyaltyTierRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("loyalty_tiers")
    .select("id, name, threshold_points, perks, active, position")
    .eq("tenant_id", context.tenant.id)
    .order("threshold_points");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    thresholdPoints: t.threshold_points,
    perks: t.perks,
    active: t.active,
    position: t.position,
  }));
}

export type LoyaltyRewardRow = {
  id: string;
  name: unknown;
  costPoints: number;
  kind: LoyaltyRewardKind;
  value: number;
  active: boolean;
  position: number;
};

export async function listLoyaltyRewards(context: TenantAdminContext): Promise<LoyaltyRewardRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("loyalty_rewards")
    .select("id, name, cost_points, kind, value, active, position")
    .eq("tenant_id", context.tenant.id)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    costPoints: r.cost_points,
    kind: r.kind as LoyaltyRewardKind,
    value: Number(r.value),
    active: r.active,
    position: r.position,
  }));
}

export type LoyaltyBalance = {
  balance: number;
  lifetimePoints: number;
  tier: { id: string; name: unknown; thresholdPoints: number } | null;
};

export async function getCustomerLoyaltyBalance(
  context: TenantAdminContext,
  customerId: string,
): Promise<LoyaltyBalance> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("loyalty_balance", { p_tenant: context.tenant.id, p_customer: customerId });
  if (error || !data) return { balance: 0, lifetimePoints: 0, tier: null };
  const row = data as {
    balance: number;
    lifetime_points: number;
    tier: { id: string; name: unknown; threshold_points: number } | null;
  };
  return {
    balance: row.balance,
    lifetimePoints: row.lifetime_points,
    tier: row.tier ? { id: row.tier.id, name: row.tier.name, thresholdPoints: row.tier.threshold_points } : null,
  };
}

export type LoyaltyLedgerRow = {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  rewardId: string | null;
  createdAt: string;
};

export async function getCustomerLoyaltyLedger(
  context: TenantAdminContext,
  customerId: string,
  limit = 50,
): Promise<LoyaltyLedgerRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("loyalty_ledger")
    .select("id, delta, reason, note, order_id, reward_id, created_at")
    .eq("tenant_id", context.tenant.id)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    id: l.id,
    delta: l.delta,
    reason: l.reason,
    note: l.note,
    orderId: l.order_id,
    rewardId: l.reward_id,
    createdAt: l.created_at,
  }));
}

/** A manual correction (goodwill points, fixing a mistake). */
export async function adjustLoyaltyPoints(
  context: TenantAdminContext,
  input: { customerId: string; delta: number; note?: string | null },
): Promise<LoyaltyBalance> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("adjust_loyalty_points", {
    p_tenant: context.tenant.id,
    p_customer: input.customerId,
    p_delta: input.delta,
    p_note: input.note ?? "",
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to adjust points");
  const row = data as { balance: number; lifetime_points: number; tier: LoyaltyBalance["tier"] };
  return { balance: row.balance, lifetimePoints: row.lifetime_points, tier: row.tier };
}

/** Redeems a reward on the customer's behalf; returns what the reward is so staff can apply the discount themselves. */
export async function redeemLoyaltyReward(
  context: TenantAdminContext,
  input: { customerId: string; rewardId: string },
): Promise<{ name: unknown; kind: LoyaltyRewardKind; value: number }> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("redeem_loyalty_reward", {
    p_tenant: context.tenant.id,
    p_customer: input.customerId,
    p_reward: input.rewardId,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to redeem reward");
  const row = data as { name: unknown; kind: LoyaltyRewardKind; value: number };
  return { name: row.name, kind: row.kind, value: row.value };
}
