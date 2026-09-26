import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { LOCALE_FORMAT_TAGS } from "@/i18n/locales";
import { formatAddress } from "@/lib/address";
import { cn } from "@/lib/cn";
import { DAYS, dayInTimeZone, hasOpeningHours, parseOpeningHours, type Day } from "@/lib/storefront/hours";
import type { SectionProps } from "@/lib/storefront/sections";

import { SectionHeading } from "../section-heading";
import { text, type SectionContext } from "./types";

// 2024-01-01 was a Monday: used only to get localized weekday names.
const MONDAY = Date.UTC(2024, 0, 1);

export async function LocationSection({ props, ctx }: { props: SectionProps<"location">; ctx: SectionContext }) {
  const t = await getTranslations("store.sections");
  const address = formatAddress(ctx.tenant.address);
  const hours = parseOpeningHours(ctx.tenant.opening_hours);
  const showHours = props.show_hours && hasOpeningHours(hours);
  if (!address && !showHours && !ctx.tenant.phone) return null;

  const tag = LOCALE_FORMAT_TAGS[ctx.locale];
  const dayName = (index: number) =>
    new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" }).format(new Date(MONDAY + index * 86_400_000));
  const time = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
      Date.UTC(2024, 0, 1, h, m),
    );
  };
  const today: Day = dayInTimeZone(new Date(), ctx.tenant.timezone);
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ctx.tenant.business_name}, ${address}`)}`
    : null;

  return (
    <section id={ctx.anchor} aria-labelledby="location-title" className="scroll-mt-24">
      <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <div>
          <SectionHeading id="location-title" title={text(ctx, props.title) || t("visitTitle")} />
          <ul className="mt-8 space-y-4">
            {address ? (
              <li className="flex gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-accent-text" aria-hidden="true" />
                <span className="text-lg">{address}</span>
              </li>
            ) : null}
            {ctx.tenant.phone ? (
              <li className="flex gap-3">
                <Phone className="mt-1 size-5 shrink-0 text-accent-text" aria-hidden="true" />
                <a href={`tel:${ctx.tenant.phone.replace(/\s+/g, "")}`} dir="ltr" className="text-lg hover:underline">
                  {ctx.tenant.phone}
                </a>
              </li>
            ) : null}
          </ul>
          {props.show_map && mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonClasses("secondary"), "mt-8")}
            >
              <Navigation className="size-4" aria-hidden="true" />
              {t("directions")}
            </a>
          ) : null}
        </div>

        {showHours ? (
          <div className="rounded-lg border border-border bg-surface p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase rtl:tracking-normal">
              <Clock className="size-4 text-accent-text" aria-hidden="true" />
              {t("openingHours")}
            </h3>
            <table className="mt-5 w-full text-sm">
              <caption className="sr-only">{t("openingHours")}</caption>
              <tbody>
                {DAYS.map((day, index) => {
                  const intervals = hours[day];
                  const isToday = day === today;
                  return (
                    <tr key={day} className={cn("border-b border-border last:border-0", isToday && "font-semibold")}>
                      <th scope="row" className="py-2.5 text-start font-normal">
                        <span className={isToday ? "font-semibold" : undefined}>{dayName(index)}</span>
                        {isToday ? <span className="ms-2 text-xs text-accent-text">{t("today")}</span> : null}
                      </th>
                      <td className="py-2.5 text-end tabular-nums">
                        {intervals === undefined
                          ? "—"
                          : intervals.length === 0
                            ? t("closed")
                            : intervals.map((i) => `${time(i.open)} – ${time(i.close)}`).join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
