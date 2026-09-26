"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * useActionState without React 19's automatic form reset.
 *
 * With `<form action={fn}>` React resets every uncontrolled field after the
 * action runs — so a validation error would wipe everything the user typed.
 * Here JavaScript submissions go through a transition instead (fields keep
 * their values); the `action` attribute stays as the no-JS fallback.
 */
export function useActionForm<S>(
  action: (state: Awaited<S>, formData: FormData) => S | Promise<S>,
  initial: Awaited<S>,
) {
  const [state, formAction, pending] = useActionState<S, FormData>(action, initial);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  };
  return { state, pending, formProps: { action: formAction, onSubmit } };
}
