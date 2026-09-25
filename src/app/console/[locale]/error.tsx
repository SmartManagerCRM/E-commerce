"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-md text-sm text-muted">{t("errorBody")}</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
