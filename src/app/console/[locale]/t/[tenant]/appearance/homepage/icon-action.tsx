"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { idleState, type FormState } from "@/lib/validation/common";

function IconButton({ label, icon, disabled }: { label: string; icon: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={disabled || pending}
      className="inline-flex size-9 items-center justify-center rounded-md text-fg/70 hover:bg-fg/5 hover:text-fg disabled:opacity-30"
    >
      {icon}
    </button>
  );
}

/** Icon-only action button with an accessible name; errors are announced. */
export function IconAction({
  action,
  id,
  label,
  icon,
  disabled,
  extra,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  extra?: Record<string, string>;
}) {
  const t = useTranslations("forms");
  const [state, formAction] = useActionState(action, idleState as FormState);
  return (
    <form action={formAction} className="relative">
      <input type="hidden" name="section_id" value={id} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <IconButton label={label} icon={icon} disabled={disabled} />
      {state.status === "error" ? (
        <span role="alert" className="sr-only">
          {t.has(`errors.${state.error}` as "errors.generic")
            ? t(`errors.${state.error}` as "errors.generic")
            : t("errors.generic")}
        </span>
      ) : null}
    </form>
  );
}
