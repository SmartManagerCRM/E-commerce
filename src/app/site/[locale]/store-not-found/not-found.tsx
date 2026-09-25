import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";

export default async function UnknownStore() {
  const t = await getTranslations("platform");
  return (
    <main id="main" className="flex flex-1 items-center">
      <Container className="max-w-xl py-24 text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-2 text-display-md font-semibold">{t("storeNotFoundTitle")}</h1>
        <p className="mt-4 text-muted">{t("storeNotFoundBody")}</p>
      </Container>
    </main>
  );
}
