import { describe, expect, it } from "vitest";

import { THEMES, getTheme } from "@/themes/definitions";
import { contrastRatio, ensureContrast, readableTextOn, themeCssVariables } from "@/themes/tokens";

describe("themes", () => {
  it("falls back to the default theme for unknown keys", () => {
    expect(getTheme("does-not-exist").key).toBe("premium-cafe");
    expect(getTheme(null).key).toBe("premium-cafe");
  });

  it.each(Object.values(THEMES))("$key has readable body text (WCAG AA)", (theme) => {
    expect(contrastRatio(theme.colors.foreground, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.muted, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("picks a readable foreground for any primary color", () => {
    expect(readableTextOn("#FFFFFF")).toBe("#111111");
    expect(readableTextOn("#111111")).toBe("#FFFFFF");
    expect(readableTextOn("#F5D90A")).toBe("#111111");
  });

  it("applies valid tenant color overrides", () => {
    const vars = themeCssVariables("premium-cafe", { colors: { primary: "#1F3A34" } });
    expect(vars["--sm-color-primary"]).toBe("#1F3A34");
    expect(vars["--sm-color-primary-fg"]).toBe("#FFFFFF");
  });

  it("ignores override values that could inject CSS", () => {
    const vars = themeCssVariables("premium-cafe", {
      colors: { primary: "red; background: url(https://evil.test)" },
    });
    expect(vars["--sm-color-primary"]).toBe(THEMES["premium-cafe"].colors.primary);
  });
});

describe("ensureContrast", () => {
  it("keeps colors that already pass", () => {
    expect(ensureContrast("#5C3A21", "#FBF8F3", "#231A14")).toBe("#5C3A21");
  });

  it("darkens light brand accents until text is AA readable", () => {
    const fixed = ensureContrast("#C8A27A", "#FBF8F3", "#231A14");
    expect(contrastRatio(fixed, "#FBF8F3")).toBeGreaterThanOrEqual(4.5);
  });

  it("exposes contrast-safe text tokens for every theme", () => {
    for (const theme of Object.values(THEMES)) {
      const vars = themeCssVariables(theme.key, {});
      expect(contrastRatio(vars["--sm-color-accent-text"], theme.colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars["--sm-color-primary-text"], theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("font stacks", () => {
  it("give every font variable a fallback so a missing font never breaks the stack", () => {
    for (const theme of Object.values(THEMES)) {
      const vars = themeCssVariables(theme.key, {});
      for (const key of ["--sm-font-display", "--sm-font-body"]) {
        expect(vars[key]).not.toMatch(/var\(--[\w-]+\)/);
      }
    }
  });
});
