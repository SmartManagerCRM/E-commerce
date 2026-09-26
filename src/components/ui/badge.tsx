import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

const TONES = {
  neutral: "bg-fg/5 text-fg",
  primary: "bg-primary text-primary-fg",
  accent: "bg-accent text-accent-fg",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  outline: "border border-border text-fg",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium tracking-wide uppercase rtl:tracking-normal",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
