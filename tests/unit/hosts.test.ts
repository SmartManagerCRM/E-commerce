import { describe, expect, it } from "vitest";

import { classifyHost, normalizeHost } from "@/lib/hosts";

const prod = { rootDomain: "e-commerce.smartmanage.me", consoleSubdomain: "app" };
const dev = { rootDomain: "localhost", consoleSubdomain: "app" };

describe("normalizeHost", () => {
  it("lower-cases and strips port, trailing dot and www", () => {
    expect(normalizeHost("WWW.Roasters.COM:443")).toBe("roasters.com");
    expect(normalizeHost("roasters.com.")).toBe("roasters.com");
    expect(normalizeHost(null)).toBe("");
  });
});

describe("classifyHost", () => {
  it("recognises the platform root and the console", () => {
    expect(classifyHost("e-commerce.smartmanage.me", prod)).toEqual({ kind: "platform" });
    expect(classifyHost("www.e-commerce.smartmanage.me", prod)).toEqual({ kind: "platform" });
    expect(classifyHost("app.e-commerce.smartmanage.me", prod)).toEqual({ kind: "console" });
  });

  it("maps platform subdomains to tenant slugs", () => {
    expect(classifyHost("roasters.e-commerce.smartmanage.me", prod)).toEqual({
      kind: "storefront",
      lookup: { by: "slug", slug: "roasters" },
    });
  });

  it("rejects nested or malformed platform subdomains", () => {
    expect(classifyHost("a.b.e-commerce.smartmanage.me", prod)).toEqual({ kind: "invalid" });
    expect(classifyHost("-bad.e-commerce.smartmanage.me", prod)).toEqual({ kind: "invalid" });
  });

  it("treats any other valid hostname as a custom domain", () => {
    expect(classifyHost("www.roasters.com", prod)).toEqual({
      kind: "storefront",
      lookup: { by: "hostname", hostname: "roasters.com" },
    });
  });

  it("does not let a look-alike domain match the platform root", () => {
    expect(classifyHost("evil-e-commerce.smartmanage.me.attacker.com", prod)).toEqual({
      kind: "storefront",
      lookup: { by: "hostname", hostname: "evil-e-commerce.smartmanage.me.attacker.com" },
    });
    expect(classifyHost("xe-commerce.smartmanage.me", prod).kind).toBe("storefront");
  });

  it("rejects garbage hosts", () => {
    expect(classifyHost("", prod)).toEqual({ kind: "invalid" });
    expect(classifyHost("127.0.0.1", prod)).toEqual({ kind: "invalid" });
    expect(classifyHost("[::1]:3000", prod)).toEqual({ kind: "invalid" });
  });

  it("supports *.localhost in development", () => {
    expect(classifyHost("localhost:3000", dev)).toEqual({ kind: "platform" });
    expect(classifyHost("app.localhost:3000", dev)).toEqual({ kind: "console" });
    expect(classifyHost("roasters.localhost:3000", dev)).toEqual({
      kind: "storefront",
      lookup: { by: "slug", slug: "roasters" },
    });
  });
});
