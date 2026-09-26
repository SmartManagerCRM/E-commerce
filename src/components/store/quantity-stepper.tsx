"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  name?: string;
  className?: string;
};

/** [ − ] 1 [ + ] with 44px touch targets and a labelled, typeable input. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, name, className }: QuantityStepperProps) {
  const t = useTranslations("catalog");
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className={cn("inline-flex h-12 items-center rounded-button border border-border bg-surface", className)}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={t("decrease")}
        className="inline-flex size-12 items-center justify-center text-fg disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        name={name}
        value={value}
        min={min}
        max={max}
        aria-label={t("quantity")}
        onChange={(e) => onChange(clamp(e.target.valueAsNumber))}
        className="h-full w-12 border-x border-border bg-transparent text-center font-medium tabular-nums [appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={t("increase")}
        className="inline-flex size-12 items-center justify-center text-fg disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
