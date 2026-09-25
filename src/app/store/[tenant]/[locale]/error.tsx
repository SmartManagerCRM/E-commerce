"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex flex-col items-center gap-4 py-24 text-center" role="alert">
      <h1 className="font-display text-display-md font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-md text-muted">{t("errorBody")}</p>
      <Button variant="secondary" onClick={reset}>
        {t("retry")}
      </Button>
    </Container>
  );
}
