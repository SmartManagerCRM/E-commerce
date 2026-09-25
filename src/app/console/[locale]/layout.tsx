import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import "../../globals.css";
import { isLocale, localeDirection } from "@/i18n/locales";
import { consoleFontClasses } from "@/themes/fonts";

export const metadata: Metadata = {
  title: { default: "SmartManager", template: "%s · SmartManager" },
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({ children, params }: LayoutProps<"/console/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const dir = localeDirection(locale);

  return (
    <html lang={locale} dir={dir} className={consoleFontClasses(dir === "rtl")}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
