"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FormState } from "@/lib/validation/common";

/** Announces the result of a form submission (translated). */
export function FormMessage({ state }: { state: FormState<unknown> }) {
  const t = useTranslations("forms");
  if (state.status === "idle") return null;
  if (state.status === "success") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        {t((state.message ?? "saved") as "saved")}
      </p>
    );
  }
  return (
    <p role="alert" className="flex items-center gap-2 text-sm text-danger">
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      {t.has(`errors.${state.error}` as "errors.generic")
        ? t(`errors.${state.error}` as "errors.generic")
        : t("errors.generic")}
    </p>
  );
}
