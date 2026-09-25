import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { SectionCard } from "@/components/ui/card";
import { isLocale, type Locale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { getSessionUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/clients";

import { inviteStaff, revokeInvite, updateMember } from "./actions";
import { InviteForm } from "./invite-form";
import { MemberActions } from "./member-actions";
import { RevokeButton } from "./revoke-button";
import { ModuleGate } from "../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/staff">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("staff") };
}

export default async function StaffPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="staff">
      <StaffContent slug={slug} locale={locale} context={context} />
    </ModuleGate>
  );
}

async function StaffContent({ slug, locale, context }: { slug: string; locale: Locale; context: TenantAdminContext }) {
  const t = await getTranslations("staff");
  const tStatus = await getTranslations("console.tenants.status");
  const format = await getFormatter();
  const supabase = await createUserClient();
  const user = await getSessionUser();

  const [{ data: members, error }, { data: invitations }, { data: roles }] = await Promise.all([
    supabase.rpc("tenant_staff", { p_tenant: context.tenant.id }),
    supabase
      .from("tenant_invitations")
      .select("id, email, role_id, expires_at, created_at")
      .eq("tenant_id", context.tenant.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("roles").select("id, key, name, rank").eq("is_system", true).order("rank", { ascending: false }),
  ]);
  if (error) throw new Error("Failed to load staff");

  const isOwner = context.roleKey === "tenant_owner" || context.isPlatformAdmin;
  const canInvite = context.permissions.includes("staff.write");
  const roleOptions = (roles ?? [])
    .filter((r) => isOwner || r.key !== "tenant_owner")
    .map((r) => ({ value: r.key, label: pickLocalized(r.name, locale) }));
  const roleName = (id: string) => pickLocalized(roles?.find((r) => r.id === id)?.name, locale);
  const seatLimit = context.features.max_staff?.limit ?? null;
  const seatsUsed = (members ?? []).filter((m) => m.status !== "disabled").length + (invitations?.length ?? 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {seatLimit !== null ? t("seats", { used: seatsUsed, limit: seatLimit }) : t("subtitle")}
        </p>
      </div>

      {canInvite ? (
        <SectionCard title={t("inviteTitle")} description={t("inviteDescription")}>
          <InviteForm action={inviteStaff.bind(null, slug)} roles={roleOptions} />
        </SectionCard>
      ) : null}

      <SectionCard title={t("membersTitle")}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">
                  {t("member")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("role")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("status")}
                </th>
                {isOwner ? (
                  <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">
                    {t("actions")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(members ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td className="px-5 py-3 sm:px-6">
                    <p className="font-medium">{m.full_name || m.email}</p>
                    <p className="text-xs text-muted" dir="ltr">
                      {m.email}
                    </p>
                  </td>
                  <td className="px-3 py-3">{pickLocalized(m.role_name, locale)}</td>
                  <td className="px-3 py-3">{m.status === "disabled" ? t("disabled") : tStatus("active")}</td>
                  {isOwner ? (
                    <td className="px-5 py-3 sm:px-6">
                      <MemberActions
                        action={updateMember.bind(null, slug)}
                        userId={m.user_id}
                        roleKey={m.role_key}
                        status={m.status}
                        roles={roleOptions}
                        isSelf={m.user_id === user?.id}
                        name={m.full_name || m.email}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={t("pendingTitle")}>
        {invitations && invitations.length > 0 ? (
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium" dir="ltr">
                    {inv.email}
                  </p>
                  <p className="text-xs text-muted">
                    {roleName(inv.role_id)} ·{" "}
                    {t("expires", { date: format.dateTime(new Date(inv.expires_at), { dateStyle: "medium" }) })}
                  </p>
                </div>
                {canInvite ? <RevokeButton action={revokeInvite.bind(null, slug)} invitationId={inv.id} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noPending")}</p>
        )}
      </SectionCard>
    </div>
  );
}
