import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { OPEN_BOOKING_STATUSES } from "@/lib/booking";
import { hashToken } from "@/server/commerce/cart-cookie";
import { getCustomerBooking } from "@/server/booking/storefront";
import { requireStorePage } from "@/server/storefront/page-tenant";

import { cancelBooking } from "../../booking/actions";
import { CancelBookingButton } from "./cancel-button";

type Props = PageProps<"/store/[tenant]/[locale]/bookings/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, locale: rawLocale } = await params;
  const { locale } = await requireStorePage(slug, rawLocale);
  const t = await getTranslations({ locale, namespace: "bookingTracking" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Booking status for the customer, reachable only with the private link from the request confirmation. */
export default async function BookingTrackingPage({ params, searchParams }: Props) {
  const { tenant: slug, locale: rawLocale, id } = await params;
  const { tenant, locale } = await requireStorePage(slug, rawLocale);
  const token = (await searchParams).t;
  if (typeof token !== "string" || !/^[\w-]{40,64}$/.test(token)) notFound();
  const tokenHash = hashToken(token);
  const booking = await getCustomerBooking(tenant, locale, id, tokenHash);
  if (!booking) notFound();

  const t = await getTranslations("bookingTracking");
  const tStatus = await getTranslations("bookingStatus");
  const format = await getFormatter();
  const canCancel = OPEN_BOOKING_STATUSES.includes(booking.status);

  return (
    <Container className="max-w-2xl py-8 sm:py-12">
      <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-5">
        <p className="font-semibold text-success">{t("thanks")}</p>
        <p className="mt-1 text-sm">{t("received", { business: tenant.business_name })}</p>
        <p className="mt-1 text-sm text-muted">{t("keepLink")}</p>
      </div>

      <h1 className="mt-8 font-display text-display-md font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("requestedOn", { date: format.dateTime(new Date(booking.createdAt), { dateStyle: "medium", timeStyle: "short" }) })}
      </p>

      <dl className="mt-8 grid gap-4 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t("status")}</dt>
          <dd className="mt-0.5 font-medium">{tStatus(booking.status)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("when")}</dt>
          <dd className="mt-0.5 font-medium">{format.dateTime(new Date(booking.startsAt), { dateStyle: "medium", timeStyle: "short" })}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("guests")}</dt>
          <dd className="mt-0.5 font-medium">{booking.guests}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("resource")}</dt>
          <dd className="mt-0.5 font-medium">{booking.resourceName}</dd>
        </div>
        {booking.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">{t("notes")}</dt>
            <dd className="mt-0.5 whitespace-pre-line">{booking.notes}</dd>
          </div>
        ) : null}
      </dl>

      {canCancel ? (
        <div className="mt-8">
          <CancelBookingButton action={cancelBooking.bind(null, booking.id, tokenHash)} />
        </div>
      ) : null}

      {tenant.phone || tenant.email ? (
        <p className="mt-10 text-sm text-muted">
          {t("questions", { business: tenant.business_name })}{" "}
          {tenant.phone ? (
            <a href={`tel:${tenant.phone.replace(/\s+/g, "")}`} className="font-medium text-fg underline" dir="ltr">
              {tenant.phone}
            </a>
          ) : null}
          {tenant.phone && tenant.email ? " · " : null}
          {tenant.email ? (
            <a href={`mailto:${tenant.email}`} className="font-medium text-fg underline">
              {tenant.email}
            </a>
          ) : null}
        </p>
      ) : null}
    </Container>
  );
}
