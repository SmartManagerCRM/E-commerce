"use client";

import { cn } from "@/lib/cn";
import type { VariantOption } from "@/lib/storefront/catalog-types";

type VariantSelectorProps = {
  legend: string;
  name: string;
  options: VariantOption[];
  value: string;
  onChange: (id: string) => void;
  unavailableLabel: string;
};

/**
 * Option pills (250g | 500g | 1kg) as a native radio group: arrow-key
 * navigation and screen-reader semantics come for free.
 */
export function VariantSelector({ legend, name, options, value, onChange, unavailableLabel }: VariantSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.id === value;
          return (
            <label
              key={option.id}
              className={cn(
                "relative inline-flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-button border px-4 text-sm transition-colors",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2",
                checked ? "border-fg bg-fg text-bg" : "border-border bg-surface hover:border-fg/50",
                !option.available && "cursor-not-allowed text-muted line-through decoration-1",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={checked}
                disabled={!option.available}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              {option.label}
              {!option.available ? <span className="sr-only"> ({unavailableLabel})</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
