import { ArrowUpRight, ArrowLeftRight, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { MobileNav } from "@/components/admin/mobile-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { LOCALES, isLocale } from "@/i18n/locales";
import { visibleModulesBySection } from "@/lib/admin/modules";
import { requireTenantAdmin } from "@/server/admin/context";
import { storefrontOrigin } from "@/server/tenant/urls";

export default async function TenantConsoleLayout({ children, params }: LayoutProps<"/console/[locale]/t/[tenant]">) {
  const { locale, tenant: slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);

  const t = await getTranslations("console.nav");
  const groups = visibleModulesBySection(context).map((g) => ({
    section: g.section,
    modules: g.modules.map((m) => ({ key: m.key })),
  })) as Parameters<typeof AdminNav>[0]["groups"];

  const brand = (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{context.tenant.businessName}</p>
      <p className="text-xs text-muted">SmartManager</p>
    </div>
  );

  const footer = (
    <div className="space-y-1">
      <a
        href={`${storefrontOrigin({ slug: context.tenant.slug })}/${locale}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-fg/80 hover:bg-fg/5"
      >
        <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("viewStore")}
      </a>
      <Link href="/" className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-fg/80 hover:bg-fg/5">
        <ArrowLeftRight className="size-4" aria-hidden="true" />
        {t("switchBusiness")}
      </Link>
      {context.isPlatformAdmin ? (
        <Link href="/platform" className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-fg/80 hover:bg-fg/5">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("platform")}
        </Link>
      ) : null}
      <SignOutButton />
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="border-b border-border px-5 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <AdminNav tenantSlug={context.tenant.slug} groups={groups} />
        </div>
        <div className="border-t border-border p-3">{footer}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav tenantSlug={context.tenant.slug} groups={groups} header={brand} footer={footer} />
            <p className="truncate text-sm font-medium lg:hidden">{context.tenant.businessName}</p>
          </div>
          <Suspense fallback={<div className="h-9" />}>
            <LanguageSwitcher locales={LOCALES} />
          </Suspense>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
