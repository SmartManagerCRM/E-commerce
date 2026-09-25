import { describe, expect, it } from "vitest";

import { asLocalizedText, pickLocalized } from "@/lib/localized";
import { formatMoney, toMinorUnits } from "@/lib/money";

describe("pickLocalized", () => {
  const value = { en: "Coffee", ar: "قهوة" };

  it("returns the requested locale", () => {
    expect(pickLocalized(value, "ar")).toBe("قهوة");
  });

  it("falls back to the tenant default, then any translation", () => {
    expect(pickLocalized(value, "fr", "ar")).toBe("قهوة");
    expect(pickLocalized(value, "fr")).toBe("Coffee");
    expect(pickLocalized({}, "fr")).toBe("");
  });

  it("drops unsupported keys and non-string values", () => {
    expect(asLocalizedText({ en: "A", de: "B", fr: 3, ar: "  " })).toEqual({ en: "A" });
    expect(asLocalizedText(null)).toEqual({});
  });
});

describe("money", () => {
  it("converts decimal strings to minor units without floats", () => {
    expect(toMinorUnits("45", 2)).toBe(BigInt(4500));
    expect(toMinorUnits("0.10", 2)).toBe(BigInt(10));
    expect(toMinorUnits("12.345", 3)).toBe(BigInt(12345));
    expect(toMinorUnits("-1.5", 2)).toBe(BigInt(-150));
  });

  it("rejects too many decimals or invalid input", () => {
    expect(() => toMinorUnits("1.234", 2)).toThrow();
    expect(() => toMinorUnits("1e3", 2)).toThrow();
  });

  it("formats per locale and currency exponent", () => {
    expect(formatMoney({ amountMinor: BigInt(4500), currency: "EUR" }, 2, "fr")).toMatch(/45,00\s€/);
    expect(formatMoney({ amountMinor: BigInt(12345), currency: "KWD" }, 3, "en")).toContain("12.345");
    const sar = formatMoney({ amountMinor: BigInt(4500), currency: "SAR" }, 2, "ar");
    expect(sar).toContain("45.00");
  });

  it("keeps precision for very large amounts", () => {
    expect(formatMoney({ amountMinor: BigInt("123456789012345678"), currency: "USD" }, 2, "en")).toContain(
      "1,234,567,890,123,456.78",
    );
  });
});
