"use client";

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation";

/**
 * Re-fetches the current page's server data periodically while it is visible,
 * so new orders appear without a manual reload (email/push alerts: Phase 7).
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
