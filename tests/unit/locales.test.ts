import { describe, expect, it } from "vitest";

import { localeDirection, negotiateLocale, parseAcceptLanguage, splitLocaleFromPath } from "@/i18n/locales";

describe("splitLocaleFromPath", () => {
  it("extracts a supported locale prefix", () => {
    expect(splitLocaleFromPath("/ar/shop/beans")).toEqual({ locale: "ar", rest: "/shop/beans" });
    expect(splitLocaleFromPath("/fr")).toEqual({ locale: "fr", rest: "" });
  });

  it("leaves unknown prefixes in the path", () => {
    expect(splitLocaleFromPath("/de/shop")).toEqual({ locale: null, rest: "/de/shop" });
    expect(splitLocaleFromPath("/")).toEqual({ locale: null, rest: "" });
    expect(splitLocaleFromPath("/english")).toEqual({ locale: null, rest: "/english" });
  });
});

describe("parseAcceptLanguage", () => {
  it("orders languages by quality", () => {
    expect(parseAcceptLanguage("fr-FR,fr;q=0.9,en-US;q=0.8,ar;q=0.95")).toEqual(["fr", "ar", "fr", "en"]);
    expect(parseAcceptLanguage("*;q=0.5, de;q=0")).toEqual([]);
  });
});

describe("negotiateLocale", () => {
  const allowed = ["ar", "en"] as const;

  it("prefers an allowed cookie", () => {
    expect(negotiateLocale({ allowed, fallback: "ar", cookie: "en", acceptLanguage: "fr" })).toBe("en");
  });

  it("ignores a cookie for a locale the tenant has disabled", () => {
    expect(negotiateLocale({ allowed, fallback: "ar", cookie: "fr", acceptLanguage: "de" })).toBe("ar");
  });

  it("uses Accept-Language, then the fallback", () => {
    expect(negotiateLocale({ allowed, fallback: "ar", acceptLanguage: "en-GB,en;q=0.9" })).toBe("en");
    expect(negotiateLocale({ allowed, fallback: "ar", acceptLanguage: "de-DE" })).toBe("ar");
  });

  it("never returns a locale outside the allowed list", () => {
    expect(negotiateLocale({ allowed: ["fr"], fallback: "en" })).toBe("fr");
  });
});

describe("localeDirection", () => {
  it("is RTL only for Arabic", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("fr")).toBe("ltr");
  });
});
