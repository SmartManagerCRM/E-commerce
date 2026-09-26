import { z } from "zod";

/**
 * Weekly opening hours stored on a branch:
 *   { "mon": [{ "open": "08:00", "close": "22:00" }], "fri": [], … }
 * An empty list means closed that day; a missing day means "not specified".
 * A close time earlier than the open time means the interval ends after
 * midnight (e.g. 18:00–02:00).
 */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const interval = z.object({ open: time, close: time }).refine((i) => i.open !== i.close, "empty");

/** Strict form for writes; `openingHoursSchema` is the lenient read form. */
export const openingHoursStrictSchema = z
  .object(Object.fromEntries(DAYS.map((d) => [d, z.array(interval).max(2).optional()])))
  .partial();

export const openingHoursSchema = openingHoursStrictSchema.catch({});

export type OpeningHours = Partial<Record<Day, { open: string; close: string }[]>>;

export function parseOpeningHours(value: unknown): OpeningHours {
  return openingHoursSchema.parse(value ?? {}) as OpeningHours;
}

export function hasOpeningHours(hours: OpeningHours): boolean {
  return DAYS.some((d) => hours[d] !== undefined);
}

/** Day key for a date in the tenant's time zone. */
export function dayInTimeZone(date: Date, timeZone: string): Day {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date).toLowerCase();
  return weekday.slice(0, 3) as Day;
}

/** schema.org OpeningHoursSpecification entries (for structured data). */
export function toSchemaOrgHours(hours: OpeningHours) {
  const names: Record<Day, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return DAYS.flatMap((day) =>
    (hours[day] ?? []).map((i) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${names[day]}`,
      opens: i.open,
      closes: i.close,
    })),
  );
}
