import { LOCALE_FORMAT_TAGS, type Locale } from "@/i18n/locales";

/**
 * Money is always handled as integer minor units (halalas, cents, millimes)
 * plus an ISO currency code. Never use floating point for amounts.
 */
export type Money = {
  amountMinor: bigint;
  currency: string;
};

export function toMinorUnits(major: string, exponent: number): bigint {
  const normalized = major.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid amount: ${major}`);
  }
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  if (fraction.length > exponent) {
    throw new Error(`Amount ${major} has more than ${exponent} decimal places`);
  }
  const minor = BigInt(whole + fraction.padEnd(exponent, "0"));
  return negative ? -minor : minor;
}

/** Formats minor units for display, e.g. 4500n SAR → "45.00 SAR" / "‏45.00 ر.س.‏". */
export function formatMoney(money: Money, exponent: number, locale: Locale): string {
  const negative = money.amountMinor < BigInt(0);
  const abs = negative ? -money.amountMinor : money.amountMinor;
  const divisor = BigInt(10) ** BigInt(exponent);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(exponent, "0");
  // Intl accepts decimal strings, so no precision is lost for large amounts.
  const decimal = `${negative ? "-" : ""}${whole}${exponent > 0 ? `.${fraction}` : ""}`;

  return new Intl.NumberFormat(LOCALE_FORMAT_TAGS[locale], {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(decimal as unknown as number);
}
