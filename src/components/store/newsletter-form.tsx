"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { subscribeNewsletter } from "@/app/store/[tenant]/[locale]/actions";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";
import { useActionForm } from "@/components/forms/use-action-form";

/** Email + explicit consent. Works without JavaScript (progressive enhancement). */
export function NewsletterForm({ businessName }: { businessName: string }) {
  const t = useTranslations("store.sections");
  const {
    state: state,
    pending: statePending,
    formProps: actionProps,
  } = useActionForm(subscribeNewsletter, idleState as FormState);
  const id = useId();

  if (state.status === "success") {
    return (
      <p role="status" className="rounded-lg bg-primary-fg/10 p-5 text-lg">
        {t("newsletterThanks")}
      </p>
    );
  }

  return (
    <form {...actionProps} className="space-y-3" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">
          {t("email")}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          placeholder={t("emailPlaceholder")}
          aria-invalid={state.status === "error" && state.error === "invalidEmail" ? true : undefined}
          className="h-12 min-w-0 flex-1 rounded-button border border-primary-fg/30 bg-primary-fg/10 px-4 text-primary-fg placeholder:text-primary-fg/60 focus-visible:border-primary-fg focus-visible:outline-none rtl:text-end"
        />
        <SubmitButton
          pending={statePending}
          className="h-12 bg-primary-fg text-primary hover:opacity-90"
          pendingLabel={t("subscribing")}
        >
          {t("subscribe")}
        </SubmitButton>
      </div>
      <label className="flex items-start gap-2 text-sm opacity-90">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-current" />
        <span>{t("consent", { business: businessName })}</span>
      </label>
      {/* Honeypot for bots; hidden from people and assistive technology. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        // Clipped in place (not pushed off-screen, which widens right-to-left pages).
        className="pointer-events-none absolute size-px overflow-hidden opacity-0 [clip-path:inset(50%)]"
      />
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium">
          {t(`errors.${state.error as "generic"}`)}
        </p>
      ) : null}
    </form>
  );
}
