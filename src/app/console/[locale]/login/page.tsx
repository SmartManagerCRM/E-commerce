import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LOCALES, isLocale } from "@/i18n/locales";
import { redirect } from "@/i18n/navigation";
import { safeRelativePath } from "@/lib/safe-path";
import { getSessionUser } from "@/server/auth/session";

import { LoginForm } from "./login-form";

export async function generateMetadata({ params }: PageProps<"/console/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.login" });
  return { title: t("title") };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/console/[locale]/login">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  const next = safeRelativePath((await searchParams).next, "");
  if (await getSessionUser()) redirect({ href: "/", locale });

  const t = await getTranslations("console");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-center text-lg font-semibold tracking-tight">{t("brand")}</p>
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-semibold">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("login.subtitle")}</p>
          <LoginForm next={next} />
        </div>
        <Suspense fallback={null}>
          <LanguageSwitcher locales={LOCALES} className="mt-6 justify-center" />
        </Suspense>
      </div>
    </main>
  );
}
