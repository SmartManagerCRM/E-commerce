import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/store/catalog/breadcrumbs";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getBookingOptions } from "@/server/booking/storefront";
import { requireStorePage } from "@/server/storefront/page-tenant";

import { fetchSlots, requestBooking } from "./actions";
import { BookingForm } from "./booking-form";

type Props = PageProps<"/store/[tenant]/[locale]/booking">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale } = await params;
  const { locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "store.booking" });
  return { title: t("title") };
}

/** Storefront booking request. Every slot shown here is computed by the database from opening hours, buffers and existing bookings. */
export default async function BookingPage({ params }: Props) {
  const { tenant: slug, locale: rawLocale } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations("store.booking");
  const tNav = await getTranslations("store.nav");
  const options = await getBookingOptions(tenant, locale);

  const crumbs = [{ label: tNav("home"), href: "/" }, { label: t("title") }];

  if (!options.acceptingBookings || options.resources.length === 0) {
    return (
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={crumbs} label={t("breadcrumb")} />
        <EmptyState
          className="mt-8"
          title={t("closedTitle")}
          description={t("closedBody")}
          action={
            <Link href="/" className={buttonClasses("secondary", "sm")}>
              {t("backHome")}
            </Link>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <Breadcrumbs items={crumbs} label={t("breadcrumb")} />
      <h1 className="mt-6 font-display text-display-md font-semibold">{t("title")}</h1>
      <BookingForm
        action={requestBooking}
        fetchSlots={fetchSlots}
        resources={options.resources}
        maxPartySize={options.maxPartySize}
        maxAdvanceDays={options.maxAdvanceDays}
      />
    </Container>
  );
}
