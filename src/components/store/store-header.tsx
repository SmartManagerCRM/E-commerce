import Image from "next/image";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/cn";
import type { HeaderLayout } from "@/lib/storefront/design";
import { publicMediaUrl } from "@/lib/storage";

import { MobileMenu } from "./mobile-menu";

export type NavItem = { label: string; href: string; hash?: string };

type StoreHeaderProps = {
  businessName: string;
  logoPath: string | null;
  locales: readonly Locale[];
  layout: HeaderLayout;
  sticky: boolean;
  announcement: string;
  nav: NavItem[];
  labels: { mainNavigation: string; menu: string; close: string };
};

function NavLinks({ nav, className }: { nav: NavItem[]; className?: string }) {
  return (
    <ul className={cn("flex items-center gap-7 text-sm", className)}>
      {nav.map((item) => (
        <li key={item.label}>
          <Link
            href={item.hash ? { pathname: item.href, hash: item.hash } : item.href}
            className="relative py-2 text-fg/80 transition-colors hover:text-fg after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform hover:after:scale-x-100 rtl:after:origin-right"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StoreHeader({
  businessName,
  logoPath,
  locales,
  layout,
  sticky,
  announcement,
  nav,
  labels,
}: StoreHeaderProps) {
  const logo = publicMediaUrl(logoPath);
  const brand = (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={businessName}>
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={44}
          height={44}
          className="h-10 w-auto max-w-[9rem] object-contain"
          priority
          unoptimized
        />
      ) : null}
      <span
        className={cn(
          "truncate font-display text-xl font-semibold tracking-tight sm:text-2xl",
          logo && "sr-only sm:not-sr-only",
        )}
      >
        {businessName}
      </span>
    </Link>
  );
  const language = (
    <Suspense fallback={<div className="h-9 w-20" />}>
      <LanguageSwitcher locales={locales} />
    </Suspense>
  );
  const mobile = <MobileMenu nav={nav} locales={locales} title={labels.menu} closeLabel={labels.close} />;

  return (
    <header
      className={cn(
        "z-40 border-b border-border/70 bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/80",
        sticky && "sticky top-0",
      )}
    >
      {announcement ? (
        <div className="bg-fg px-4 py-2 text-center text-xs font-medium tracking-wide text-bg sm:text-sm rtl:tracking-normal">
          {announcement}
        </div>
      ) : null}
      {layout === "centered" ? (
        <Container className="py-3 sm:py-4">
          {/* On phones the brand takes the remaining width and truncates; from sm up it is truly centred. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <div className="flex items-center">{mobile}</div>
            <div className="flex min-w-0 justify-center">{brand}</div>
            <div className="flex justify-end">{language}</div>
          </div>
          {nav.length > 0 ? (
            <nav aria-label={labels.mainNavigation} className="mt-3 hidden justify-center lg:flex">
              <NavLinks nav={nav} />
            </nav>
          ) : null}
        </Container>
      ) : (
        <Container className="flex h-16 items-center justify-between gap-6 sm:h-20">
          <div className="flex min-w-0 items-center gap-2">
            {mobile}
            {brand}
          </div>
          {nav.length > 0 ? (
            <nav aria-label={labels.mainNavigation} className="hidden lg:block">
              <NavLinks nav={nav} />
            </nav>
          ) : null}
          <div className="shrink-0">{language}</div>
        </Container>
      )}
    </header>
  );
}
