"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { AdminNav, type AdminNavGroup } from "./admin-nav";

type MobileNavProps = {
  tenantSlug: string;
  groups: AdminNavGroup[];
  header: ReactNode;
  footer: ReactNode;
};

/** Accessible slide-in navigation drawer for small screens (focus-trapped, Esc to close). */
export function MobileNav({ tenantSlug, groups, header, footer }: MobileNavProps) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("openMenu")} className="lg:hidden">
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-overlay focus:outline-none lg:hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title asChild>{header}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t("closeMenu")}>
                <X className="size-5" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t("openMenu")}</Dialog.Description>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <AdminNav tenantSlug={tenantSlug} groups={groups} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border p-3">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
