import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { isLocale, type Locale } from "@/i18n/locales";
import { nextBookingStatuses } from "@/lib/booking";
import { pickLocalized } from "@/lib/localized";
import { requireTenantAdmin, type TenantAdminContext } from "@/server/admin/context";
import { catalogSettings } from "@/server/catalog/admin";
import * as bookingsService from "@/server/services/bookings";
import { createUserClient } from "@/server/supabase/clients";

import { changeBookingStatus } from "../actions";
import { BookingStatusActions } from "./booking-actions";
import { ModuleGate } from "../../module-gate";

type Props = PageProps<"/console/[locale]/t/[tenant]/bookings/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "console.nav" });
  return { title: t("bookings") };
}

export default async function BookingDetailPage({ params }: Props) {
  const { locale, tenant: slug, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const context = await requireTenantAdmin(locale, slug);
  return (
    <ModuleGate context={context} moduleKey="bookings">
      <Detail slug={slug} locale={locale} id={id} context={context} />
    </ModuleGate>
  );
}

async function Detail({
  slug,
  locale,
  id,
  context,
}: {
  slug: string;
  locale: Locale;
  id: string;
  context: TenantAdminContext;
}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("bookings");
  const tStatus = await getTranslations("bookingStatus");
  const format = await getFormatter();
  const settings = await catalogSettings(context);

  const booking = await bookingsService.getBooking(context, id);
  if (!booking) notFound();

  const supabase = await createUserClient();
  const { data: resource } = await supabase
    .from("booking_resources")
    .select("name")
    .eq("tenant_id", context.tenant.id)
    .eq("id", booking.resourceId)
    .maybeSingle();

  const canWrite = context.permissions.includes("bookings.write");
  const next = nextBookingStatuses(booking.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/t/${slug}/bookings`} className="text-sm text-muted hover:text-fg">
          ← {t("title")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{pickLocalized(resource?.name, locale, settings.defaultLocale) || t("booking")}</h1>
          <Badge tone={booking.status === "confirmed" ? "success" : booking.status === "pending" ? "outline" : "neutral"}>
            {tStatus(booking.status)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {t("requestedOn", { date: format.dateTime(new Date(booking.createdAt), { dateStyle: "medium", timeStyle: "short" }) })}
          {" · "}
          {t(`source.${booking.source}`)}
        </p>
      </div>

      {canWrite && next.length > 0 ? (
        <SectionCard title={t("nextStep")}>
          <BookingStatusActions action={changeBookingStatus.bind(null, slug, booking.id)} next={next} />
        </SectionCard>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <SectionCard title={t("when")}>
          <p className="text-sm">{format.dateTime(new Date(booking.startsAt), { dateStyle: "full", timeStyle: "short" })}</p>
        </SectionCard>
        <SectionCard title={t("guests")}>
          <p className="text-sm">{booking.guests}</p>
        </SectionCard>
      </div>

      <SectionCard title={t("customer")}>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{booking.contact.name}</p>
          <p className="flex items-center gap-2">
            <Mail className="size-4 text-muted" aria-hidden="true" />
            <a href={`mailto:${booking.contact.email}`} className="hover:underline" dir="ltr">
              {booking.contact.email}
            </a>
          </p>
          {booking.contact.phone ? (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-muted" aria-hidden="true" />
              <a href={`tel:${booking.contact.phone.replace(/\s+/g, "")}`} className="hover:underline" dir="ltr">
                {booking.contact.phone}
              </a>
            </p>
          ) : null}
        </div>
      </SectionCard>

      {booking.notes ? (
        <SectionCard title={t("notes")}>
          <p className="text-sm whitespace-pre-line">{booking.notes}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
