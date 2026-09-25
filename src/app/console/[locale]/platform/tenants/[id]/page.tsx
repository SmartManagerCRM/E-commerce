import type { Metadata } from "next";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { ActionForm } from "@/components/forms/action-form";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { requirePlatformAdmin } from "@/server/auth/platform";
import { serverEnv } from "@/server/env";
import { createUserClient } from "@/server/supabase/clients";
import { storefrontOrigin } from "@/server/tenant/urls";

import { inviteOwner, setDomainConnected, setFeatureOverride, setTenantPlan, setTenantStatus } from "../../actions";
import { OwnerInviteForm } from "./owner-invite-form";

type Props = PageProps<"/console/[locale]/platform/tenants/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "platformAdmin.detail" });
  return { title: t("title") };
}

const selectClass = "h-9 rounded-md border border-border bg-surface px-2 text-sm";

export default async function TenantDetailPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);

  const t = await getTranslations("platformAdmin");
  const tStatus = await getTranslations("console.tenants.status");
  const format = await getFormatter();
  const supabase = await createUserClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, business_name, business_type, status, currency, default_language, enabled_languages, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!tenant) notFound();

  const [
    { data: subscription },
    { data: plans },
    { data: features },
    { data: overrides },
    { data: domains },
    { data: staff },
    { data: context },
  ] = await Promise.all([
    supabase
      .from("tenant_subscriptions")
      .select("status, trial_ends_at, plans(key, name)")
      .eq("tenant_id", id)
      .in("status", ["trialing", "active", "past_due"])
      .maybeSingle(),
    supabase.from("plans").select("key, name").order("sort_order"),
    supabase.from("features").select("key, kind, name").order("sort_order"),
    supabase.from("tenant_feature_overrides").select("feature_key, enabled, limit_value").eq("tenant_id", id),
    supabase
      .from("tenant_domains")
      .select("id, hostname, verified_at, hosting_connected_at, is_primary")
      .eq("tenant_id", id)
      .order("created_at"),
    supabase.rpc("tenant_staff", { p_tenant: id }),
    supabase.rpc("tenant_admin_context", { p_tenant: id }),
  ]);

  const effective =
    (context as { features?: Record<string, { enabled: boolean; limit: number | null }> } | null)?.features ?? {};
  const env = serverEnv();
  const platformHost = `${tenant.slug}.${env.PLATFORM_ROOT_DOMAIN}`;
  const owners = (staff ?? []).filter((m) => m.role_key === "tenant_owner");

  return (
    <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/platform" className="text-sm text-muted hover:text-fg">
        ← {t("backToBusinesses")}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.business_name}</h1>
          <p className="mt-1 text-sm text-muted">
            <span dir="ltr">{tenant.slug}</span> · {t(`businessTypes.${tenant.business_type as "cafe"}`)} ·{" "}
            {tenant.currency} · {format.dateTime(new Date(tenant.created_at), { dateStyle: "medium" })}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/t/${tenant.slug}`} className="font-medium text-primary-text hover:underline">
            {t("detail.openConsole")}
          </Link>
          <a
            href={`${storefrontOrigin({ slug: tenant.slug })}/${tenant.default_language}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline"
          >
            {t("detail.openStore")}
            <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard title={t("detail.statusTitle")} description={t("detail.statusDescription")}>
          <ActionForm action={setTenantStatus.bind(null, id)} submitLabel={t("detail.update")}>
            <div className="space-y-1.5 text-sm">
              <label htmlFor="tenant-status" className="block font-medium">
                {t("detail.status")}
              </label>
              <select id="tenant-status" name="status" defaultValue={tenant.status} className={selectClass}>
                {(["onboarding", "active", "suspended", "closed"] as const).map((s) => (
                  <option key={s} value={s}>
                    {tStatus(s)}
                  </option>
                ))}
              </select>
            </div>
          </ActionForm>
        </SectionCard>

        <SectionCard
          title={t("detail.planTitle")}
          description={
            subscription?.plans
              ? t("detail.currentPlan", {
                  plan: pickLocalized(subscription.plans.name, locale),
                  status: t(`subscriptionStatus.${subscription.status as "active"}`),
                })
              : t("detail.noPlan")
          }
        >
          <ActionForm action={setTenantPlan.bind(null, id)} submitLabel={t("detail.update")}>
            <div className="space-y-1.5 text-sm">
              <label htmlFor="tenant-plan" className="block font-medium">
                {t("detail.plan")}
              </label>
              <select
                id="tenant-plan"
                name="plan_key"
                defaultValue={subscription?.plans?.key ?? ""}
                className={selectClass}
              >
                {(plans ?? []).map((p) => (
                  <option key={p.key} value={p.key}>
                    {pickLocalized(p.name, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 text-sm">
              <label htmlFor="tenant-subscription" className="block font-medium">
                {t("detail.subscriptionStatus")}
              </label>
              <select
                id="tenant-subscription"
                name="subscription_status"
                defaultValue={subscription?.status ?? "active"}
                className={selectClass}
              >
                {(["trialing", "active", "past_due"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`subscriptionStatus.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </ActionForm>
        </SectionCard>
      </div>

      <SectionCard title={t("detail.hostsTitle")} description={t("detail.hostsDescription")}>
        <ul className="divide-y divide-border text-sm">
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="font-medium" dir="ltr">
              {platformHost}
            </span>
            <span className="text-xs text-muted">{t("detail.platformSubdomain")}</span>
          </li>
          {(domains ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-1">
                <p className="font-medium" dir="ltr">
                  {d.hostname}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  {d.verified_at ? (
                    <CheckCircle2 className="size-3 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="size-3" aria-hidden="true" />
                  )}
                  {d.verified_at ? t("detail.dnsVerified") : t("detail.dnsPending")}
                  {d.hosting_connected_at ? ` · ${t("detail.connected")}` : ""}
                </p>
              </div>
              {d.verified_at ? (
                <ActionForm
                  action={setDomainConnected}
                  submitLabel={d.hosting_connected_at ? t("detail.markDisconnected") : t("detail.markConnected")}
                >
                  <input type="hidden" name="domain_id" value={d.id} />
                  <input type="hidden" name="connected" value={d.hosting_connected_at ? "false" : "true"} />
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={t("detail.ownersTitle")}>
        <div className="space-y-5">
          {owners.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {owners.map((o) => (
                <li key={o.user_id}>
                  <span className="font-medium">{o.full_name || o.email}</span>{" "}
                  <span className="text-muted" dir="ltr">
                    {o.email}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("detail.noOwner")}</p>
          )}
          <OwnerInviteForm action={inviteOwner.bind(null, id)} />
        </div>
      </SectionCard>

      <SectionCard title={t("detail.featuresTitle")} description={t("detail.featuresDescription")}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">
                  {t("detail.feature")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("detail.effective")}
                </th>
                <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">
                  {t("detail.override")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(features ?? []).map((f) => {
                const o = overrides?.find((x) => x.feature_key === f.key);
                const e = effective[f.key];
                return (
                  <tr key={f.key}>
                    <td className="px-5 py-2 sm:px-6">{pickLocalized(f.name, locale)}</td>
                    <td className="px-3 py-2 text-muted">
                      {e?.enabled
                        ? f.kind === "limit"
                          ? (e.limit ?? t("detail.unlimited"))
                          : t("detail.on")
                        : t("detail.off")}
                    </td>
                    <td className="px-5 py-2 sm:px-6">
                      <ActionForm action={setFeatureOverride.bind(null, id)} submitLabel={t("detail.apply")}>
                        <input type="hidden" name="feature_key" value={f.key} />
                        <label className="sr-only" htmlFor={`mode-${f.key}`}>
                          {t("detail.override")}
                        </label>
                        <select
                          id={`mode-${f.key}`}
                          name="mode"
                          defaultValue={o ? (o.enabled ? "enabled" : "disabled") : "inherit"}
                          className={selectClass}
                        >
                          <option value="inherit">{t("detail.inherit")}</option>
                          <option value="enabled">{t("detail.forceOn")}</option>
                          <option value="disabled">{t("detail.forceOff")}</option>
                        </select>
                        {f.kind === "limit" ? (
                          <>
                            <label className="sr-only" htmlFor={`limit-${f.key}`}>
                              {t("detail.limit")}
                            </label>
                            <input
                              id={`limit-${f.key}`}
                              name="limit_value"
                              inputMode="numeric"
                              defaultValue={o?.limit_value ?? ""}
                              placeholder={t("detail.limit")}
                              className={`${selectClass} w-24`}
                            />
                          </>
                        ) : (
                          <input type="hidden" name="limit_value" value="" />
                        )}
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}
