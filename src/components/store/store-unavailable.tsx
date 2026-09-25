import { getTranslations } from "next-intl/server";

type StoreUnavailableProps = {
  name: string;
  status: "onboarding" | "suspended";
};

export async function StoreUnavailable({ name, status }: StoreUnavailableProps) {
  const t = await getTranslations("store.unavailable");
  const title = status === "suspended" ? t("suspendedTitle") : t("onboardingTitle");
  const body = status === "suspended" ? t("suspendedBody") : t("onboardingBody", { name });

  return (
    <section className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-sm tracking-[0.2em] text-muted uppercase">{name}</p>
      <h1 className="font-display text-display-md font-semibold rtl:leading-snug">{title}</h1>
      <p className="text-muted">{body}</p>
    </section>
  );
}
