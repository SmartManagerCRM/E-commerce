import { getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function ConsoleNotFound() {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-muted">{t("notFoundBody")}</p>
      <Link href="/" className={buttonClasses("secondary", "sm")}>
        {t("backHome")}
      </Link>
    </div>
  );
}
