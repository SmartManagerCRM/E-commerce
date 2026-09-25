"use client";

import { useActionState, type ReactNode } from "react";

import type { ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { idleState, type FormState } from "@/lib/validation/common";

import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

type ActionFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

/** Small form wired to a Server Action, with its own pending and result state. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  variant = "secondary",
  size = "sm",
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, idleState as FormState);
  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <SubmitButton variant={variant} size={size}>
          {submitLabel}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
