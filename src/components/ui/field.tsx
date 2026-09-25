import { useId, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

type FieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Labelled text input with accessible hint and error wiring. */
export function Field({ label, hint, error, className, id, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-fg sm:text-sm",
          "placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
          "aria-[invalid=true]:border-danger",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
