import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LOCALES, isLocale } from "@/i18n/locales";
import { consoleOrigin } from "@/server/tenant/urls";

export default async function PlatformHomePage({ params }: PageProps<"/site/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const t = await getTranslations("platform");

  return (
    <>
      <header className="border-b border-border bg-surface">
        <Container className="flex h-16 items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">SmartManager</span>
          <Suspense fallback={<div className="h-9" />}>
            <LanguageSwitcher locales={LOCALES} />
          </Suspense>
        </Container>
      </header>
      <main id="main" className="flex flex-1 items-center">
        <Container className="max-w-3xl py-24 text-center">
          <h1 className="text-display-lg font-semibold text-balance rtl:leading-snug">{t("tagline")}</h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted">{t("intro")}</p>
          <a href={`${consoleOrigin()}/${locale}`} className={buttonClasses("primary", "lg") + " mt-10"}>
            {t("signIn")}
          </a>
        </Container>
      </main>
    </>
  );
}
