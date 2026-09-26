import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@/i18n/locales";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { commerceConfigured } from "@/server/commerce/storefront";
import { createUserClient } from "@/server/supabase/clients";

import { saveNotificationSettings } from "./actions";
import { NotificationSettingsForm } from "./notification-form";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/settings/notifications">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "notificationSettings" });
  return { title: t("title") };
}

export default async function NotificationSettingsPage({ params }: Props) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="settings">
      <Content slug={slug} context={context} />
    </ModuleGate>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = { sent: "success", failed: "danger", skipped: "outline" };

async function Content({ slug, context }: { slug: string; context: TenantAdminContext }) {
  const t = await getTranslations("notificationSettings");
  const canEdit = context.permissions.includes("settings.write");
  const format = await getFormatter();
  const supabase = await createUserClient();
  const [{ data: tenant }, { data: log }] = await Promise.all([
    supabase.from("tenants").select("email").eq("id", context.tenant.id).single(),
    supabase
      .from("notifications")
      .select("id, template, recipient_email, subject, status, error, created_at")
      .eq("tenant_id", context.tenant.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const { data: row } = await supabase.from("tenant_settings").select("notifications").eq("tenant_id", context.tenant.id).single();
  const settings = (row?.notifications ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href={`/t/${slug}/settings`} className="text-sm text-muted hover:text-fg">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <SectionCard title={t("emailTitle")} description={t("emailDescription")}>
        <NotificationSettingsForm
          action={saveNotificationSettings.bind(null, slug)}
          disabled={!canEdit}
          configured={commerceConfigured()}
          values={{
            orderEmails: settings.order_emails !== false,
            dailyBrief: settings.daily_brief !== false,
            recipientEmail: typeof settings.recipient_email === "string" ? settings.recipient_email : "",
            tenantEmail: tenant?.email ?? null,
          }}
        />
      </SectionCard>

      <SectionCard title={t("logTitle")} description={t("logDescription")}>
        {log && log.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {log.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{n.subject}</p>
                  <p className="truncate text-xs text-muted">
                    {n.recipient_email ?? "—"} · {format.dateTime(new Date(n.created_at), { dateStyle: "medium", timeStyle: "short" })}
                    {n.error ? ` · ${n.error}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[n.status] ?? "outline"}>{t(`status.${n.status as "sent"}`)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noNotifications")}</p>
        )}
      </SectionCard>
    </div>
  );
}
