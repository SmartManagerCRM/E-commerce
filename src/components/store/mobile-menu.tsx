"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Drawer } from "@/components/ui/drawer";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";

import type { NavItem } from "./store-header";

/** Mobile navigation drawer (start side), including the language switcher. */
export function MobileMenu({
  nav,
  locales,
  title,
  closeLabel,
}: {
  nav: NavItem[];
  locales: readonly Locale[];
  title: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={title}
      closeLabel={closeLabel}
      side="start"
      trigger={
        <button
          type="button"
          aria-label={title}
          className="-ms-2 inline-flex size-11 items-center justify-center rounded-md hover:bg-fg/5 lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      }
      footer={<LanguageSwitcher locales={locales} />}
    >
      <nav aria-label={title}>
        <ul className="space-y-1">
          {nav.map((item) => (
            <li key={item.label}>
              <Link
                href={item.hash ? { pathname: item.href, hash: item.hash } : item.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center border-b border-border font-display text-xl"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Drawer>
  );
}
