import { describe, expect, it } from "vitest";

import { resolveStorefrontDesign } from "@/lib/storefront/design";
import { dayInTimeZone, openingHoursStrictSchema, parseOpeningHours, toSchemaOrgHours } from "@/lib/storefront/hours";
import { defaultSections, hrefSchema, parseSections, SECTION_REGISTRY } from "@/lib/storefront/sections";
import { jsonLdScript } from "@/lib/storefront/structured-data";
import { rateLimit, resetRateLimits } from "@/server/security/rate-limit";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("homepage sections", () => {
  it("keeps valid sections in order and drops malformed or unavailable ones", () => {
    const parsed = parseSections([
      { id: uuid(1), type: "hero", enabled: true, props: { title: { en: "Hi", de: "x" }, variant: "centered" } },
      { id: "not-a-uuid", type: "hero", enabled: true, props: {} },
      { id: uuid(2), type: "unknown", enabled: true, props: {} },
      { id: uuid(3), type: "loyalty", enabled: true, props: {} },
      { id: uuid(4), type: "location", enabled: false, props: { show_hours: "yes" } },
      "garbage",
    ]);
    expect(parsed.map((s) => s.type)).toEqual(["hero", "location"]);
    expect(parsed[0].props).toMatchObject({ variant: "centered", title: { en: "Hi" } });
    // Invalid field values fall back to safe defaults instead of breaking the page.
    expect(parsed[1].props).toMatchObject({ show_hours: true });
  });

  it("never returns anything for non-arrays", () => {
    expect(parseSections(null)).toEqual([]);
    expect(parseSections({ hero: true })).toEqual([]);
  });

  it("only allows safe link targets", () => {
    for (const ok of ["/", "/shop", "#visit", "https://instagram.com/x", "tel:+966 11 000", "mailto:a@b.co"]) {
      expect(hrefSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["javascript:alert(1)", "//evil.com", "http://insecure.com", "data:text/html,x", "/\\evil"]) {
      expect(hrefSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("drops images that are not in the tenant sections folder", () => {
    const [hero] = parseSections([
      { id: uuid(1), type: "hero", enabled: true, props: { image_path: "../../etc/passwd" } },
    ]);
    expect(hero.props).toMatchObject({ image_path: null });
  });

  it("builds defaults only from real tenant data", () => {
    let i = 0;
    const sections = defaultSections(
      { business_name: "Roasters", tagline: { en: "Fresh" }, description: {}, hasAddress: true },
      () => uuid(++i),
    );
    expect(sections.map((s) => [s.type, s.enabled])).toEqual([
      ["hero", true],
      ["location", true],
      ["newsletter", false],
    ]);
  });

  it("marks module-dependent sections as unavailable until their phase", () => {
    expect(SECTION_REGISTRY.loyalty.available).toBe(false);
    expect(SECTION_REGISTRY.featured_products.available).toBe(true);
    expect(SECTION_REGISTRY.booking_cta.available).toBe(false);
    expect(SECTION_REGISTRY.hero.available).toBe(true);
  });
});

describe("storefront design resolution", () => {
  it("uses theme defaults and applies valid tenant overrides", () => {
    const base = resolveStorefrontDesign({ theme_key: "luxury", tokens: {}, header: {}, footer: {} });
    expect(base).toMatchObject({
      fontRole: "classic-serif",
      button: "square",
      card: "minimal",
      headerLayout: "centered",
    });

    const custom = resolveStorefrontDesign({
      theme_key: "luxury",
      tokens: { typography: "sans", buttons: "pill", cards: "elevated" },
      header: { layout: "classic", sticky: false, announcement: { en: "Free delivery" } },
      footer: { social: { instagram: "https://instagram.com/roasters", x: "javascript:alert(1)" } },
    });
    expect(custom).toMatchObject({
      fontRole: "sans",
      button: "pill",
      card: "elevated",
      headerLayout: "classic",
      stickyHeader: false,
    });
    expect(custom.announcement).toEqual({ en: "Free delivery" });
    expect(custom.social).toEqual({ instagram: "https://instagram.com/roasters" });
  });

  it("ignores invalid token values", () => {
    const design = resolveStorefrontDesign({
      theme_key: "nope",
      tokens: { typography: "comic-sans" },
      header: null,
      footer: null,
    });
    expect(design.theme.key).toBe("premium-cafe");
    expect(design.fontRole).toBe("serif-display");
  });
});

describe("opening hours", () => {
  it("validates writes strictly", () => {
    expect(openingHoursStrictSchema.safeParse({ mon: [{ open: "08:00", close: "22:00" }], fri: [] }).success).toBe(
      true,
    );
    expect(openingHoursStrictSchema.safeParse({ mon: [{ open: "8am", close: "22:00" }] }).success).toBe(false);
    expect(openingHoursStrictSchema.safeParse({ mon: [{ open: "08:00", close: "08:00" }] }).success).toBe(false);
  });

  it("reads leniently and converts to schema.org", () => {
    expect(parseOpeningHours("garbage")).toEqual({});
    expect(toSchemaOrgHours({ sat: [{ open: "18:00", close: "02:00" }], sun: [] })).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Saturday",
        opens: "18:00",
        closes: "02:00",
      },
    ]);
  });

  it("computes the weekday in the tenant time zone", () => {
    // 2026-09-25 22:30 UTC is already Saturday in Riyadh (UTC+3).
    const date = new Date(Date.UTC(2026, 8, 25, 22, 30));
    expect(dayInTimeZone(date, "UTC")).toBe("fri");
    expect(dayInTimeZone(date, "Asia/Riyadh")).toBe("sat");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit within the window, then blocks", () => {
    resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, now + i).ok).toBe(true);
    expect(rateLimit("k", 3, 60_000, now + 10).ok).toBe(false);
    expect(rateLimit("k", 3, 60_000, now + 60_001).ok).toBe(true);
    expect(rateLimit("other", 3, 60_000, now).ok).toBe(true);
  });
});

describe("structured data", () => {
  it("cannot break out of the script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
