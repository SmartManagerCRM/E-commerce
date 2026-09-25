import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/** Page-width wrapper with the standard responsive gutters. */
export function Container({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}
