"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

const controlClasses = cn(
  "w-full rounded-md border border-border bg-surface px-3 text-base text-fg sm:text-sm",
  "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
  "aria-[invalid=true]:border-danger disabled:opacity-60",
);

type Labelled = { label: string; hint?: string; error?: string };

function Described({
  id,
  label,
  hint,
  error,
  children,
}: Labelled & { id: string; children: (describedBy?: string) => ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(describedBy)}
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

export function TextInput({ label, hint, error, className, ...props }: Labelled & ComponentPropsWithoutRef<"input">) {
  const id = useId();
  return (
    <Described id={props.id ?? id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={props.id ?? id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses, "h-11", className)}
          {...props}
        />
      )}
    </Described>
  );
}

export function TextArea({ label, hint, error, className, ...props }: Labelled & ComponentPropsWithoutRef<"textarea">) {
  const id = useId();
  return (
    <Described id={props.id ?? id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <textarea
          id={props.id ?? id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses, "min-h-24 py-2", className)}
          {...props}
        />
      )}
    </Described>
  );
}

export function Select({
  label,
  hint,
  error,
  className,
  options,
  ...props
}: Labelled & ComponentPropsWithoutRef<"select"> & { options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <Described id={props.id ?? id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <select
          id={props.id ?? id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlClasses, "h-11", className)}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Described>
  );
}
