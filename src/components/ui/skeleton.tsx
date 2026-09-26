import { cn } from "@/lib/cn";

/** Loading placeholder; hidden from assistive technology (pair with aria-busy on the region). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-fg/[0.06]", className)} />;
}
