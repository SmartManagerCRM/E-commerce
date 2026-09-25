import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";

type SectionCardProps = ComponentPropsWithoutRef<"section"> & {
  title: string;
  description?: string;
  actions?: ReactNode;
};

/** Titled admin section with consistent spacing. */
export function SectionCard({ title, description, actions, className, children, ...props }: SectionCardProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface shadow-card", className)} {...props}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}
