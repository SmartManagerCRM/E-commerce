import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/store/catalog/breadcrumbs";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { formatAddress } from "@/lib/address";
import { cartTokenHash } from "@/server/commerce/cart-cookie";
import { getCart, getCheckoutOptions, getQuote } from "@/server/commerce/storefront";
import { requireStorePage } from "@/server/storefront/page-tenant";

import { placeOrder } from "../cart/actions";
import { CheckoutForm, type QuoteView } from "./checkout-form";

type Props = PageProps<"/store/[tenant]/[locale]/checkout">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale } = await params;
  const { locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Checkout. Every fulfillment option is quoted by the database up front, so
 * switching between pickup and delivery zones updates the summary instantly;
 * the order is priced again when it is placed.
 */
export default async function CheckoutPage({ params }: Props) {
  const { tenant: slug, locale: rawLocale } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations("store.checkout");
  const tNav = await getTranslations("store.nav");
  const tokenHash = await cartTokenHash();
  const [checkout, cart] = await Promise.all([getCheckoutOptions(tenant, locale), getCart(tenant, locale, tokenHash)]);

  if (!tokenHash || cart.items.length === 0) redirect({ href: "/cart", locale });

  const crumbs = [{ label: tNav("home"), href: "/" }, { label: t("cart"), href: "/cart" }, { label: t("title") }];

  if (!checkout.orderingOpen) {
    return (
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={crumbs} label={t("breadcrumb")} />
        <EmptyState
          className="mt-8"
          title={t("closedTitle")}
          description={t("closedBody")}
          action={
            <Link href="/cart" className={buttonClasses("secondary", "sm")}>
              {t("backToCart")}
            </Link>
          }
        />
      </Container>
    );
  }

  const toView = (q: Awaited<ReturnType<typeof getQuote>>): QuoteView | null =>
    q
      ? {
          subtotal: q.subtotalMinor.toString(),
          deliveryFee: q.deliveryFeeMinor.toString(),
          tax: q.taxMinor.toString(),
          total: q.totalMinor.toString(),
          problems: q.problems,
        }
      : null;
  const quotes: Record<string, QuoteView | null> = {};
  if (checkout.pickup) quotes.pickup = toView(await getQuote(tenant, tokenHash!, "pickup", null));
  if (checkout.delivery) {
    for (const zone of checkout.zones) {
      quotes[`delivery:${zone.id}`] = toView(await getQuote(tenant, tokenHash!, "delivery", zone.id));
    }
  }

  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={crumbs} label={t("breadcrumb")} />
      <h1 className="mt-6 font-display text-display-md font-semibold">{t("title")}</h1>
      <CheckoutForm
        action={placeOrder}
        currency={tenant.currency}
        exponent={tenant.currency_exponent}
        pickup={checkout.pickup ? { address: formatAddress(tenant.address) } : null}
        zones={
          checkout.delivery
            ? checkout.zones.map((z) => ({
                ...z,
                feeMinor: z.feeMinor.toString(),
                minOrderMinor: z.minOrderMinor?.toString() ?? null,
                freeOverMinor: z.freeOverMinor?.toString() ?? null,
              }))
            : []
        }
        tax={{ rateBps: checkout.taxRateBps, included: checkout.taxIncluded }}
        quotes={quotes}
        lines={cart.items.map((i) => ({
          id: i.variantId,
          name: i.name,
          options: i.options,
          image: i.image,
          qty: i.qty,
          total: i.lineTotalMinor.toString(),
        }))}
        businessName={tenant.business_name}
      />
    </Container>
  );
}
