import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

/** Five-star rating display with an accessible text equivalent. */
export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  const t = useTranslations("catalog");
  const rounded = Math.round(value * 2) / 2;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)}>
      <span className="sr-only">{t("ratingLabel", { value: value.toFixed(1) })}</span>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          const fill = rounded >= i + 1 ? 1 : rounded >= i + 0.5 ? 0.5 : 0;
          return (
            <span key={i} className="relative size-4">
              <Star className="absolute inset-0 size-4 text-fg/20" />
              {fill > 0 ? (
                <span
                  className="absolute inset-y-0 start-0 overflow-hidden"
                  style={{ width: fill === 1 ? "100%" : "50%" }}
                >
                  <Star className="size-4 fill-accent text-accent" />
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      <span className="font-medium tabular-nums" aria-hidden="true">
        {value.toFixed(1)}
      </span>
      {count !== undefined ? (
        <span className="text-muted">
          ({count}
          <span className="sr-only"> {t("reviews", { count })}</span>)
        </span>
      ) : null}
    </div>
  );
}
