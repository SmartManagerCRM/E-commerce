import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { formDataToObject } from "@/lib/form-data";
import { safeRelativePath } from "@/lib/safe-path";
import { businessProfileSchema, createTenantSchema, customDomainSchema } from "@/lib/validation/tenant";
import { checkDomainOwnership, verificationRecord } from "@/server/domains/verification";

describe("domain ownership verification", () => {
  const token = "abc123";
  const record = verificationRecord("shop.example.com", token);

  it("uses a dedicated TXT record name", () => {
    expect(record).toEqual({
      name: "_smartmanager-verify.shop.example.com",
      value: "smartmanager-verify=abc123",
    });
  });

  it("verifies when the TXT value matches (including split strings)", async () => {
    const resolver = vi.fn().mockResolvedValue([["other"], ["smartmanager-", "verify=abc123"]]);
    await expect(checkDomainOwnership("shop.example.com", token, resolver)).resolves.toEqual({ verified: true });
    expect(resolver).toHaveBeenCalledWith("_smartmanager-verify.shop.example.com");
  });

  it("rejects a different token", async () => {
    const resolver = vi.fn().mockResolvedValue([["smartmanager-verify=someone-else"]]);
    await expect(checkDomainOwnership("shop.example.com", token, resolver)).resolves.toEqual({
      verified: false,
      reason: "mismatch",
    });
  });

  it("reports missing records and DNS failures distinctly", async () => {
    const notFound = Object.assign(new Error("x"), { code: "ENOTFOUND" });
    const failure = Object.assign(new Error("x"), { code: "ETIMEOUT" });
    await expect(checkDomainOwnership("a.com", token, vi.fn().mockRejectedValue(notFound))).resolves.toMatchObject({
      reason: "not_found",
    });
    await expect(checkDomainOwnership("a.com", token, vi.fn().mockRejectedValue(failure))).resolves.toMatchObject({
      reason: "dns_error",
    });
  });
});

describe("customDomainSchema", () => {
  it("normalizes pasted URLs", () => {
    expect(customDomainSchema.parse("  HTTPS://Shop.Example.com/path ")).toBe("shop.example.com");
  });

  it("rejects non-hostnames", () => {
    for (const bad of ["localhost", "not a domain", "-x.com", "a..com", "http://", "192.168.1.1"]) {
      expect(customDomainSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("safeRelativePath", () => {
  it("allows same-origin paths", () => {
    expect(safeRelativePath("/en/invite/abc")).toBe("/en/invite/abc");
  });

  it("blocks open redirects", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/a b", 42]) {
      expect(safeRelativePath(bad, "/")).toBe("/");
    }
  });
});

describe("formDataToObject", () => {
  it("builds nested objects and arrays", () => {
    const fd = new FormData();
    fd.append("business_name", "Café");
    fd.append("tagline.ar", "مرحبا");
    fd.append("tagline.en", "Hello");
    fd.append("enabled_languages[]", "ar");
    fd.append("enabled_languages[]", "en");
    fd.append("$ACTION_ID_x", "ignored");
    expect(formDataToObject(fd)).toEqual({
      business_name: "Café",
      tagline: { ar: "مرحبا", en: "Hello" },
      enabled_languages: ["ar", "en"],
    });
  });
});

describe("business validation", () => {
  const base = {
    business_name: "Roasters",
    tagline: { en: "Hi", fr: "" },
    description: {},
    phone: "",
    email: "",
    address_line1: "",
    address_line2: "",
    city: "Riyadh",
    postal_code: "",
    country: "sa",
    timezone: "Asia/Riyadh",
    default_language: "ar",
    enabled_languages: ["ar", "en"],
  };

  it("drops empty translations and normalizes optional fields", () => {
    const parsed = businessProfileSchema.parse(base);
    expect(parsed.tagline).toEqual({ en: "Hi" });
    expect(parsed.email).toBeNull();
    expect(parsed.country).toBe("SA");
  });

  it("requires the default language to be enabled", () => {
    expect(businessProfileSchema.safeParse({ ...base, default_language: "fr" }).success).toBe(false);
  });

  it("rejects unknown time zones and locales", () => {
    expect(businessProfileSchema.safeParse({ ...base, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(businessProfileSchema.safeParse({ ...base, enabled_languages: ["ar", "de"] }).success).toBe(false);
  });

  it("validates new tenants", () => {
    const ok = createTenantSchema.safeParse({
      business_name: "New Café",
      slug: "New-Cafe",
      business_type: "cafe",
      currency: "sar",
      timezone: "Asia/Riyadh",
      country: "",
      city: "",
      plan_key: "starter",
      owner_email: "Owner@Example.com",
      default_language: "ar",
      enabled_languages: ["ar"],
    });
    expect(ok.success && ok.data.slug).toBe("new-cafe");
    expect(ok.success && ok.data.owner_email).toBe("owner@example.com");
    expect(createTenantSchema.safeParse({ ...(ok.success ? ok.data : {}), slug: "bad slug!" }).success).toBe(false);
  });
});
