import type { Metadata } from "next";
import { Building2, ChevronRight, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { SignOutButton } from "@/components/admin/sign-out-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { EmptyState } from "@/components/ui/empty-state";
import { Link, redirect } from "@/i18n/navigation";
import { LOCALES, isLocale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { isPlatformAdmin, requireUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/clients";

export async function generateMetadata({ params }: PageProps<"/console/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.tenants" });
  return { title: t("title") };
}

/** Business switcher: lists the tenants the signed-in user belongs to. */
export default async function ConsoleHomePage({ params }: PageProps<"/console/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const user = await requireUser(locale);

  const supabase = await createUserClient();
  const { data: memberships, error } = await supabase.rpc("my_memberships");
  if (error) throw new Error(`Failed to load memberships: ${error.message}`);
  const platformAdmin = await isPlatformAdmin(user.id);

  if (memberships.length === 1 && !platformAdmin) {
    redirect({ href: `/t/${memberships[0].slug}`, locale });
  }

  const t = await getTranslations("console");
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">{t("brand")}</span>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <LanguageSwitcher locales={LOCALES} />
            </Suspense>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{t("tenants.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("tenants.subtitle")}</p>

        {platformAdmin ? (
          <Link
            href="/platform"
            className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm font-medium hover:border-primary/40"
          >
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <span className="flex-1">{t("nav.platform")}</span>
            <ChevronRight className="size-4 text-muted rtl:-scale-x-100" aria-hidden="true" />
          </Link>
        ) : null}

        {memberships.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Building2 />}
            title={t("tenants.empty")}
            description={t("tenants.emptyHint")}
          />
        ) : (
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {memberships.map((m) => (
              <li key={m.tenant_id}>
                <Link href={`/t/${m.slug}`} className="flex items-center gap-4 p-4 hover:bg-fg/[0.03]">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary">
                    {m.business_name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.business_name}</span>
                    <span className="block text-xs text-muted">
                      {t("tenants.role")}: {pickLocalized(m.role_name, locale)} ·{" "}
                      {t(`tenants.status.${m.tenant_status as "active" | "onboarding" | "suspended" | "closed"}`)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted rtl:-scale-x-100" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
