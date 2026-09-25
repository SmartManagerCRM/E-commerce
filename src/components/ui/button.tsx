import { Slot } from "@radix-ui/react-slot";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-fg hover:bg-bg",
  ghost: "text-fg hover:bg-fg/5",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

const SIZES = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  icon: "size-11",
} as const;

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Render the child element (e.g. a link) with button styling. */
  asChild?: boolean;
};

export function buttonClasses(variant: keyof typeof VARIANTS = "primary", size: keyof typeof SIZES = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap",
    "transition-[opacity,background-color] duration-150 ease-standard",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    variant === "link" ? "h-auto px-0" : SIZES[size],
  );
}

export function Button({ variant, size, asChild, className, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonClasses(variant, size), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
