import type { Metadata } from "next";
import { MailX } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { SignOutButton } from "@/components/admin/sign-out-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { LOCALES, isLocale } from "@/i18n/locales";
import { pickLocalized } from "@/lib/localized";
import { getSessionUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/clients";

import { acceptInvitation, createAccountFromInvitation } from "./actions";
import { AcceptForm, SignupForm } from "./invite-forms";

type Props = PageProps<"/console/[locale]/invite/[token]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "invite" });
  return { title: t("title"), referrer: "no-referrer" };
}

type Invitation = {
  email: string;
  business_name: string;
  role_name: unknown;
  expired: boolean;
  accepted: boolean;
  revoked: boolean;
};

export default async function InvitePage({ params }: Props) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("invite");

  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await createUserClient();
  const { data } = valid ? await supabase.rpc("get_invitation", { p_token: token }) : { data: null };
  const invitation = data as Invitation | null;
  const user = await getSessionUser();

  let body: React.ReactNode;
  if (!invitation || invitation.revoked) {
    body = <EmptyState icon={<MailX />} title={t("invalidTitle")} description={t("invalidBody")} />;
  } else if (invitation.accepted) {
    body = (
      <EmptyState
        title={t("usedTitle")}
        description={t("usedBody")}
        action={
          <Link href="/" className={buttonClasses("secondary", "sm")}>
            {t("goToDashboard")}
          </Link>
        }
      />
    );
  } else if (invitation.expired) {
    body = <EmptyState icon={<MailX />} title={t("expiredTitle")} description={t("expiredBody")} />;
  } else {
    const roleName = pickLocalized(invitation.role_name, locale);
    const intro = (
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("heading", { business: invitation.business_name })}</h1>
        <p className="text-sm text-muted">{t("roleLine", { role: roleName })}</p>
      </div>
    );
    if (user && user.email?.toLowerCase() === invitation.email.toLowerCase()) {
      body = (
        <div className="space-y-6">
          {intro}
          <AcceptForm action={acceptInvitation.bind(null, token)} />
        </div>
      );
    } else if (user) {
      body = (
        <div className="space-y-6">
          {intro}
          <p role="alert" className="text-sm text-danger">
            {t("wrongAccount", { email: invitation.email })}
          </p>
          <SignOutButton />
        </div>
      );
    } else {
      body = (
        <div className="space-y-6">
          {intro}
          <SignupForm action={createAccountFromInvitation.bind(null, token)} email={invitation.email} />
          <p className="text-center text-sm text-muted">
            {t("haveAccount")}{" "}
            <Link
              href={{ pathname: "/login", query: { next: `/${locale}/invite/${token}` } }}
              className="font-medium text-primary-text hover:underline"
            >
              {t("signIn")}
            </Link>
          </p>
        </div>
      );
    }
  }

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-center text-lg font-semibold tracking-tight">SmartManager</p>
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8">{body}</div>
        <Suspense fallback={null}>
          <LanguageSwitcher locales={LOCALES} className="mt-6 justify-center" />
        </Suspense>
      </div>
    </main>
  );
}
