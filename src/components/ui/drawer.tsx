"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  /** Logical side: "end" is right in LTR and left in RTL. */
  side?: "start" | "end";
  children: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
};

/**
 * Accessible side sheet (focus trap, Esc, scroll lock, labelled). Used for the
 * mobile menu now and the cart drawer later. Direction-aware via logical sides.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  side = "end",
  children,
  footer,
  trigger,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[22rem] max-w-[88vw] flex-col bg-surface text-fg shadow-overlay focus:outline-none",
            side === "end" ? "end-0" : "start-0",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              className="inline-flex size-10 items-center justify-center rounded-md hover:bg-fg/5"
              aria-label={closeLabel}
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-border px-5 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
