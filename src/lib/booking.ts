/**
 * Booking workflow shared by the console UI and tests. The database
 * (`app.allowed_next_booking_statuses`) is authoritative; this mirror only
 * decides which buttons to show.
 */
export const BOOKING_STATUSES = ["pending", "confirmed", "rejected", "cancelled", "completed", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingResourceKind = "table" | "area" | "staff" | "room";

export const OPEN_BOOKING_STATUSES: readonly BookingStatus[] = ["pending", "confirmed"];

export function nextBookingStatuses(status: BookingStatus): BookingStatus[] {
  switch (status) {
    case "pending":
      return ["confirmed", "rejected", "cancelled"];
    case "confirmed":
      return ["completed", "no_show", "cancelled"];
    default:
      return [];
  }
}
