"use client";

import { CheckCircle2, Clock, Globe, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { TextInput } from "@/components/forms/controls";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState, type FormState } from "@/lib/validation/common";

type DomainAction = (state: FormState, formData: FormData) => Promise<FormState>;

export type DomainRow = {
  id: string;
  hostname: string;
  isPrimary: boolean;
  verified: boolean;
  connected: boolean;
  lastCheckError: string | null;
  record: { name: string; value: string };
};

type Props = {
  platformHost: string;
  dnsTarget: string | null;
  domains: DomainRow[];
  entitled: boolean;
  canEdit: boolean;
  actions: { add: DomainAction; verify: DomainAction; primary: DomainAction; remove: DomainAction };
};

function RowForm({
  action,
  domainId,
  label,
  variant,
}: {
  action: DomainAction;
  domainId: string;
  label: string;
  variant?: "secondary" | "ghost";
}) {
  const [state, formAction] = useActionState(action, idleState as FormState);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="domain_id" value={domainId} />
      <SubmitButton variant={variant ?? "secondary"} size="sm">
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DomainsSection({ platformHost, dnsTarget, domains, entitled, canEdit, actions }: Props) {
  const t = useTranslations("settings.domains");
  const [addState, addAction] = useActionState(actions.add, idleState as FormState);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-md border border-border bg-bg px-4 py-3 text-sm">
        <Globe className="size-4 text-muted" aria-hidden="true" />
        <span className="text-muted">{t("platformAddress")}</span>
        <span className="font-medium" dir="ltr">
          {platformHost}
        </span>
      </div>

      {!entitled ? (
        <p className="text-sm text-muted">{t("notEntitled")}</p>
      ) : (
        <>
          {domains.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {domains.map((d) => (
                <li key={d.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium" dir="ltr">
                      {d.hostname}
                    </span>
                    {d.isPrimary ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary-text">
                        <Star className="size-3" aria-hidden="true" />
                        {t("primary")}
                      </span>
                    ) : null}
                    <span
                      className={
                        d.verified
                          ? "inline-flex items-center gap-1 text-xs text-success"
                          : "inline-flex items-center gap-1 text-xs text-warning"
                      }
                    >
                      {d.verified ? (
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                      ) : (
                        <Clock className="size-3" aria-hidden="true" />
                      )}
                      {d.verified ? t("verified") : t("pending")}
                    </span>
                    {d.verified ? (
                      <span className="text-xs text-muted">
                        {d.connected ? t("connected") : t("awaitingConnection")}
                      </span>
                    ) : null}
                  </div>

                  {!d.verified ? (
                    <div className="space-y-2 rounded-md bg-bg p-3 text-sm">
                      <p>{t("instructions")}</p>
                      <dl className="grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-4" dir="ltr">
                        <dt className="text-muted">{t("recordType")}</dt>
                        <dd className="font-mono">TXT</dd>
                        <dt className="text-muted">{t("recordName")}</dt>
                        <dd className="font-mono break-all">{d.record.name}</dd>
                        <dt className="text-muted">{t("recordValue")}</dt>
                        <dd className="font-mono break-all">{d.record.value}</dd>
                      </dl>
                      {dnsTarget ? <p className="text-xs text-muted">{t("pointTo", { target: dnsTarget })}</p> : null}
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="flex flex-wrap gap-3">
                      {!d.verified ? <RowForm action={actions.verify} domainId={d.id} label={t("verify")} /> : null}
                      {d.verified && !d.isPrimary ? (
                        <RowForm action={actions.primary} domainId={d.id} label={t("makePrimary")} />
                      ) : null}
                      <RowForm action={actions.remove} domainId={d.id} label={t("remove")} variant="ghost" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("empty")}</p>
          )}

          {canEdit ? (
            <form action={addAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <TextInput
                  label={t("addLabel")}
                  name="hostname"
                  placeholder="shop.example.com"
                  dir="ltr"
                  required
                  autoComplete="off"
                />
              </div>
              <SubmitButton variant="secondary">{t("add")}</SubmitButton>
            </form>
          ) : null}
          <FormMessage state={addState} />
        </>
      )}
    </div>
  );
}
