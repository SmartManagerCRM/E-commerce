import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Use "alert" for error states so assistive technology announces them. */
  role?: "status" | "alert";
};

export function EmptyState({ icon, title, description, action, className, role = "status" }: EmptyStateProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="text-muted [&_svg]:size-8" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
