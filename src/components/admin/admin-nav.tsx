"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import type { AdminModuleKey, AdminSection } from "@/lib/admin/modules";
import { cn } from "@/lib/cn";

import { NAV_ICONS } from "./nav-icons";

export type AdminNavGroup = { section: AdminSection; modules: { key: AdminModuleKey }[] };

type AdminNavProps = {
  tenantSlug: string;
  groups: AdminNavGroup[];
  onNavigate?: () => void;
};

export function AdminNav({ tenantSlug, groups, onNavigate }: AdminNavProps) {
  const t = useTranslations("console.nav");
  const pathname = usePathname();
  const base = `/t/${tenantSlug}`;

  return (
    <nav aria-label={t("sections.main")} className="space-y-6">
      {groups.map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted uppercase rtl:tracking-normal">
            {t(`sections.${group.section}`)}
          </p>
          <ul className="space-y-0.5">
            {group.modules.map(({ key }) => {
              const href = key === "dashboard" ? base : `${base}/${key}`;
              const active = key === "dashboard" ? pathname === base : pathname.startsWith(href);
              const Icon = NAV_ICONS[key];
              return (
                <li key={key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                      active ? "bg-primary/10 font-medium text-primary" : "text-fg/80 hover:bg-fg/5 hover:text-fg",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
