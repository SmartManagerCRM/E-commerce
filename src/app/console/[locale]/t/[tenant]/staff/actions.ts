"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import type { FormState } from "@/lib/validation/common";
import { inviteSchema } from "@/lib/validation/tenant";
import { actionContext } from "@/server/admin/guards";
import { notifyStaffInvited } from "@/server/notifications/notify";
import { createUserClient } from "@/server/supabase/clients";
import { consoleOrigin } from "@/server/tenant/urls";

const ROLE_LABEL: Record<string, string> = {
  tenant_owner: "an owner",
  admin: "an admin",
  manager: "a manager",
  staff: "a staff member",
};

const PATH = "/console/[locale]/t/[tenant]/staff";

const ERROR_BY_CODE: Record<string, string> = {
  "42501": "forbidden",
  "23505": "alreadyMember",
  "53400": "staffLimit",
  "22023": "invalid",
};

export async function inviteStaff(
  slug: string,
  _prev: FormState<{ link: string }>,
  formData: FormData,
): Promise<FormState<{ link: string }>> {
  const context = await actionContext(slug, "staff.write");
  if (!context) return { status: "error", error: "forbidden" };

  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role_key: formData.get("role_key") });
  if (!parsed.success) return { status: "error", error: "invalid" };

  const supabase = await createUserClient();
  const { data: token, error } = await supabase.rpc("invite_member", {
    p_tenant: context.tenant.id,
    p_email: parsed.data.email,
    p_role_key: parsed.data.role_key,
  });
  if (error || !token) return { status: "error", error: ERROR_BY_CODE[error?.code ?? ""] ?? "generic" };

  revalidatePath(PATH, "page");
  const link = `${consoleOrigin()}/${await getLocale()}/invite/${token}`;
  await notifyStaffInvited({
    tenantId: context.tenant.id,
    businessName: context.tenant.businessName,
    email: parsed.data.email,
    roleLabel: ROLE_LABEL[parsed.data.role_key] ?? "a team member",
    inviteUrl: link,
  });
  // The link is also shown in the console so it can be shared manually
  // (the invitee's inbox may be slow, or the email may not be configured).
  return { status: "success", message: "inviteCreated", data: { link } };
}

export async function revokeInvite(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "staff.write");
  if (!context) return { status: "error", error: "forbidden" };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: String(formData.get("invitation_id")) });
  if (error) return { status: "error", error: ERROR_BY_CODE[error.code] ?? "generic" };
  revalidatePath(PATH, "page");
  return { status: "success", message: "inviteRevoked" };
}

const memberUpdateSchema = z.object({
  user_id: z.uuid(),
  intent: z.enum(["role", "disable", "enable", "remove"]),
  role_key: z.enum(["tenant_owner", "admin", "manager", "staff"]).optional(),
});

/** Membership changes are owner-only; RLS and the last-owner guard enforce it in the database too. */
export async function updateMember(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const context = await actionContext(slug, "staff.write");
  if (!context || (context.roleKey !== "tenant_owner" && !context.isPlatformAdmin)) {
    return { status: "error", error: "ownerOnly" };
  }
  const parsed = memberUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", error: "invalid" };
  const { user_id, intent, role_key } = parsed.data;

  const supabase = await createUserClient();
  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    q.eq("tenant_id", context.tenant.id).eq("user_id", user_id);

  let error;
  if (intent === "remove") {
    ({ error } = await scoped(supabase.from("tenant_members").delete()));
  } else if (intent === "role") {
    if (!role_key) return { status: "error", error: "invalid" };
    const { data: role } = await supabase.from("roles").select("id").eq("key", role_key).eq("is_system", true).single();
    if (!role) return { status: "error", error: "invalid" };
    ({ error } = await scoped(supabase.from("tenant_members").update({ role_id: role.id })));
  } else {
    ({ error } = await scoped(
      supabase.from("tenant_members").update({ status: intent === "disable" ? "disabled" : "active" }),
    ));
  }

  if (error) {
    return {
      status: "error",
      error: error.code === "23514" ? "lastOwner" : (ERROR_BY_CODE[error.code] ?? "generic"),
    };
  }
  revalidatePath(PATH, "page");
  return { status: "success", message: "saved" };
}
