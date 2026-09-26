"use client";

import { Loader2, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";

import { QuantityStepper } from "../quantity-stepper";

export type AddToCartAction = (
  variantId: string,
  qty: number,
) => Promise<{ status: "success"; count: number; limited: boolean } | { status: "error"; error: string }>;

/**
 * Quantity + "Add to cart". The server decides price and caps the quantity at
 * the stock that can be sold; the result is announced (toast + live region).
 */
export function AddToCart({
  action,
  variantId,
  soldOut,
}: {
  action: AddToCartAction;
  variantId: string | null;
  soldOut: boolean;
}) {
  const t = useTranslations("store.cart");
  const tc = useTranslations("catalog");
  const toast = useToast();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const add = () => {
    if (!variantId) return;
    startTransition(async () => {
      const result = await action(variantId, qty);
      if (result.status === "success") {
        const text = result.limited ? t("addedLimited") : t("added");
        setMessage({ tone: "success", text });
        toast.show(text);
        router.refresh();
      } else {
        const text = t.has(`errors.${result.error}` as "errors.generic")
          ? t(`errors.${result.error}` as "errors.generic")
          : t("errors.generic");
        setMessage({ tone: "error", text });
      }
    });
  };

  const disabled = !variantId || soldOut || pending;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={qty} onChange={setQty} />
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="inline-flex h-12 min-w-44 flex-1 items-center justify-center gap-2 rounded-button bg-primary px-6 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShoppingBag className="size-4" aria-hidden="true" />
          )}
          {soldOut ? tc("soldOut") : pending ? t("adding") : tc("addToCart")}
        </button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {message ? (
          <span className={message.tone === "error" ? "text-danger" : "text-success"}>
            {message.text}{" "}
            {message.tone === "success" ? (
              <Link href="/cart" className="font-medium underline">
                {t("viewCart")}
              </Link>
            ) : null}
          </span>
        ) : null}
      </p>
    </div>
  );
}
