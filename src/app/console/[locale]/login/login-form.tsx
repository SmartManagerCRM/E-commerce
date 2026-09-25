"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

import { signIn, type SignInState } from "../actions";

const initialState: SignInState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("console.login");
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label={t("email")} name="email" type="email" autoComplete="email" required dir="ltr" />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" required dir="ltr" />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {t(state.error)}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending} aria-disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
