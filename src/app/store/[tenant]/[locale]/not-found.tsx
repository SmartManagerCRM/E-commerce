import { getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

export default async function StoreNotFound() {
  const t = await getTranslations("common");
  return (
    <Container className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-accent-text">404</p>
      <h1 className="font-display text-display-md font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted">{t("notFoundBody")}</p>
      <Link href="/" className={buttonClasses("secondary")}>
        {t("backHome")}
      </Link>
    </Container>
  );
}
