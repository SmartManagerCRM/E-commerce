import Image from "next/image";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { publicMediaUrl } from "@/lib/storage";

type StoreHeaderProps = {
  businessName: string;
  logoPath: string | null;
  locales: readonly Locale[];
};

export function StoreHeader({ businessName, logoPath, locales }: StoreHeaderProps) {
  const logo = publicMediaUrl(logoPath);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <Container className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={businessName}>
          {logo ? (
            <Image src={logo} alt="" width={40} height={40} className="size-10 rounded-sm object-contain" priority />
          ) : null}
          <span className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">{businessName}</span>
        </Link>
        <Suspense fallback={<div className="h-9" />}>
          <LanguageSwitcher locales={locales} />
        </Suspense>
      </Container>
    </header>
  );
}
