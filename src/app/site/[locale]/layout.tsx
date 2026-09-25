import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import "../../globals.css";
import { isLocale, localeDirection } from "@/i18n/locales";
import { consoleFontClasses } from "@/themes/fonts";

export async function generateMetadata({ params }: LayoutProps<"/site/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "platform" });
  return {
    title: { default: "SmartManager E-commerce", template: "%s · SmartManager" },
    description: t("intro"),
  };
}

export default async function PlatformSiteLayout({ children, params }: LayoutProps<"/site/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const dir = localeDirection(locale);

  return (
    <html lang={locale} dir={dir} className={consoleFontClasses(dir === "rtl")}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
