import "server-only";

import type { TenantAdminContext } from "@/server/admin/context";
import { createUserClient } from "@/server/supabase/clients";

/**
 * Physical tables and seated visits (branches → tables → table_sessions →
 * orders → order_items). Every function here is a thin, typed wrapper over a
 * permission-checked Postgres function or an RLS-protected read — never a
 * raw, unchecked query. `TenantAdminContext` (from `requireTenantAdmin`) is
 * the same authorization boundary the console UI uses; nothing here widens
 * it, so this module is safe to hand to a future AI tool-calling layer once
 * that layer resolves its own `TenantAdminContext` the normal way (a signed-in
 * staff session), rather than a chat message supplying a tenant id directly.
 */
export type TableRow = {
  id: string;
  branchId: string;
  label: string;
  capacity: number | null;
  status: "available" | "occupied" | "reserved" | "inactive";
  position: number;
  active: boolean;
};

export type TableSessionRow = {
  id: string;
  branchId: string;
  tableId: string;
  status: "open" | "closed" | "cancelled";
  partySize: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
};

export async function listTables(context: TenantAdminContext, branchId?: string): Promise<TableRow[]> {
  const supabase = await createUserClient();
  let query = supabase
    .from("tables")
    .select("id, branch_id, label, capacity, status, position, active")
    .eq("tenant_id", context.tenant.id)
    .order("position");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    branchId: t.branch_id,
    label: t.label,
    capacity: t.capacity,
    status: t.status as TableRow["status"],
    position: t.position,
    active: t.active,
  }));
}

export async function createTable(
  context: TenantAdminContext,
  input: { branchId: string; label: string; capacity?: number | null },
): Promise<string> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("create_table", {
    p_tenant: context.tenant.id,
    p_branch: input.branchId,
    p_label: input.label,
    p_capacity: input.capacity ?? undefined,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to create table");
  return data;
}

export async function listOpenTableSessions(context: TenantAdminContext): Promise<TableSessionRow[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("table_sessions")
    .select("id, branch_id, table_id, status, party_size, notes, opened_at, closed_at")
    .eq("tenant_id", context.tenant.id)
    .eq("status", "open")
    .order("opened_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id,
    branchId: s.branch_id,
    tableId: s.table_id,
    status: s.status as TableSessionRow["status"],
    partySize: s.party_size,
    notes: s.notes,
    openedAt: s.opened_at,
    closedAt: s.closed_at,
  }));
}

/** Seats a party at a table. Fails if the table doesn't exist or already has an open session. */
export async function openTableSession(
  context: TenantAdminContext,
  input: { tableId: string; partySize?: number; notes?: string },
): Promise<string> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("open_table_session", {
    p_tenant: context.tenant.id,
    p_table: input.tableId,
    p_party_size: input.partySize ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to open table session");
  return data;
}

/** Closes a session and frees its table. Fails while any order on it is still open. */
export async function closeTableSession(context: TenantAdminContext, sessionId: string): Promise<void> {
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("close_table_session", { p_tenant: context.tenant.id, p_session: sessionId });
  if (error) throw new Error(error.message);
}
