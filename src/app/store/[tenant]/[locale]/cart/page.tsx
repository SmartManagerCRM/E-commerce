import type { Metadata } from "next";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/store/catalog/breadcrumbs";
import { Money } from "@/components/store/money";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { cartTokenHash } from "@/server/commerce/cart-cookie";
import { getCart, getCheckoutOptions } from "@/server/commerce/storefront";
import { requireStorePage } from "@/server/storefront/page-tenant";

import { updateCartLine } from "./actions";

type Props = PageProps<"/store/[tenant]/[locale]/cart">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale } = await params;
  const { locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "store.cart" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

function QtyButton({
  variantId,
  qty,
  label,
  children,
}: {
  variantId: string;
  qty: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <form action={updateCartLine}>
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="qty" value={qty} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-fg/5"
      >
        {children}
      </button>
    </form>
  );
}

/** Cart: live prices from the database, quantity changes as plain forms (work without JavaScript). */
export default async function CartPage({ params }: Props) {
  const { tenant: slug, locale: rawLocale } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations("store.cart");
  const tNav = await getTranslations("store.nav");
  const [checkout, cart] = await Promise.all([
    getCheckoutOptions(tenant, locale),
    getCart(tenant, locale, await cartTokenHash()),
  ]);
  const currency = { currency: tenant.currency, exponent: tenant.currency_exponent };
  const blocked = cart.items.some((i) => i.status !== "ok");

  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={[{ label: tNav("home"), href: "/" }, { label: t("title") }]} label={t("breadcrumb")} />
      <h1 className="mt-6 font-display text-display-md font-semibold">{t("title")}</h1>

      {cart.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ShoppingBag />}
          title={t("emptyTitle")}
          description={checkout.orderingOpen ? t("emptyBody") : t("closedBody")}
          action={
            <Link href="/shop" className={buttonClasses("primary", "sm")}>
              {t("continueShopping")}
            </Link>
          }
        />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ul className="divide-y divide-border border-y border-border">
            {cart.items.map((item) => (
              <li key={item.variantId} className="flex gap-4 py-5">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-fg/[0.04] sm:size-28">
                  {item.image ? <Image src={item.image} alt="" fill sizes="112px" className="object-cover" /> : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={item.href} className="font-medium hover:underline">
                        {item.name}
                      </Link>
                      {item.options ? <p className="text-sm text-muted">{item.options}</p> : null}
                      <p className="text-sm text-muted">
                        <Money amount={item.unitPriceMinor} {...currency} />
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">
                      <Money amount={item.lineTotalMinor} {...currency} />
                    </p>
                  </div>
                  {item.status !== "ok" ? (
                    <p role="alert" className="text-sm text-danger">
                      {t(`lineStatus.${item.status}`)}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center gap-1 pt-2">
                    <div className="inline-flex items-center rounded-button border border-border">
                      <QtyButton
                        variantId={item.variantId}
                        qty={item.qty - 1}
                        label={t("decrease", { name: item.name })}
                      >
                        <Minus className="size-4" aria-hidden="true" />
                      </QtyButton>
                      <span
                        className="min-w-8 text-center tabular-nums"
                        aria-label={t("quantity", { name: item.name })}
                      >
                        {item.qty}
                      </span>
                      <QtyButton
                        variantId={item.variantId}
                        qty={Math.min(99, item.qty + 1)}
                        label={t("increase", { name: item.name })}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </QtyButton>
                    </div>
                    <QtyButton variantId={item.variantId} qty={0} label={t("remove", { name: item.name })}>
                      <Trash2 className="size-4 text-muted" aria-hidden="true" />
                    </QtyButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside
            aria-labelledby="cart-summary"
            className="h-fit space-y-4 rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-24"
          >
            <h2 id="cart-summary" className="text-lg font-semibold">
              {t("summary")}
            </h2>
            <dl className="flex items-center justify-between">
              <dt>{t("subtotal", { count: cart.itemCount })}</dt>
              <dd className="font-semibold tabular-nums">
                <Money amount={cart.subtotalMinor} {...currency} />
              </dd>
            </dl>
            <p className="text-sm text-muted">
              {checkout.taxRateBps > 0 && checkout.taxIncluded ? t("taxIncludedNote") : t("calculatedAtCheckout")}
            </p>
            {checkout.orderingOpen ? (
              blocked ? (
                <p role="alert" className="text-sm text-danger">
                  {t("fixItems")}
                </p>
              ) : (
                <Link href="/checkout" className={cn(buttonClasses("primary", "lg"), "w-full")}>
                  {t("checkout")}
                </Link>
              )
            ) : (
              <p className="text-sm text-muted">{t("closedBody")}</p>
            )}
            <Link href="/shop" className="block text-center text-sm text-muted hover:text-fg hover:underline">
              {t("continueShopping")}
            </Link>
          </aside>
        </div>
      )}
    </Container>
  );
}
