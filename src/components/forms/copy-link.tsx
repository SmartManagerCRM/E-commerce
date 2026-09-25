"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Read-only link with a copy button (used for invitation links). */
export function CopyLink({ link, label }: { link: string; label: string }) {
  const t = useTranslations("forms");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={link}
        dir="ltr"
        aria-label={label}
        className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        variant="secondary"
        size="sm"
        className="h-10"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
