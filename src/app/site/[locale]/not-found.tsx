import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";

export default async function PlatformNotFound() {
  const t = await getTranslations("common");
  return (
    <main id="main" className="flex flex-1 items-center">
      <Container className="max-w-xl py-24 text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-2 text-display-md font-semibold">{t("notFoundTitle")}</h1>
        <p className="mt-4 text-muted">{t("notFoundBody")}</p>
      </Container>
    </main>
  );
}
