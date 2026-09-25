import { z } from "zod";

import { getTheme, type ThemeColors, type ThemeDefinition } from "./definitions";

/**
 * Converts a theme (+ validated tenant overrides) into CSS custom properties.
 * Values are validated so tenant-controlled data can never inject CSS.
 */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const tenantTokenOverridesSchema = z
  .object({
    colors: z
      .object({
        background: hexColor,
        surface: hexColor,
        foreground: hexColor,
        muted: hexColor,
        border: hexColor,
        primary: hexColor,
        accent: hexColor,
      })
      .partial()
      .optional(),
  })
  .catch({});

export type TenantTokenOverrides = z.infer<typeof tenantTokenOverridesSchema>;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/**
 * Returns `color` unchanged if it reaches `minRatio` against `background`,
 * otherwise mixes it toward `target` (usually the text color) until it does.
 * Lets tenants choose any brand accent while text stays WCAG AA readable.
 */
export function ensureContrast(color: string, background: string, target: string, minRatio = 4.5): string {
  if (contrastRatio(color, background) >= minRatio) return color;
  const from = Number.parseInt(color.slice(1), 16);
  const to = Number.parseInt(target.slice(1), 16);
  const channels = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const [a, b] = [channels(from), channels(to)];
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    const mixed = toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    if (contrastRatio(mixed, background) >= minRatio) return mixed;
  }
  return target;
}

/** Picks near-black or white text, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111111") ? "#FFFFFF" : "#111111";
}

const ARABIC_DISPLAY = "var(--font-arabic-display, var(--font-arabic, system-ui))";
const BODY_FONT = "var(--font-inter, system-ui), var(--font-arabic, system-ui), system-ui, sans-serif";

const BUTTON_RADIUS: Record<ThemeDefinition["button"], string> = {
  pill: "9999px",
  rounded: "0.5rem",
  square: "0",
};

export function resolveThemeColors(theme: ThemeDefinition, overrides: unknown): ThemeColors {
  const parsed = tenantTokenOverridesSchema.parse(overrides);
  return { ...theme.colors, ...parsed.colors };
}

export function themeCssVariables(themeKey: string | null | undefined, overrides: unknown): Record<string, string> {
  const theme = getTheme(themeKey);
  const colors = resolveThemeColors(theme, overrides);
  // Every font variable has a fallback: an undefined var() would invalidate
  // the whole font-family declaration (Arabic fonts are only loaded for RTL).
  const displayFont =
    theme.displayFont === "serif-display"
      ? `var(--font-fraunces, Georgia), ${ARABIC_DISPLAY}, Georgia, serif`
      : theme.displayFont === "classic-serif"
        ? `var(--font-cormorant, Georgia), ${ARABIC_DISPLAY}, Georgia, serif`
        : BODY_FONT;

  return {
    "--sm-color-bg": colors.background,
    "--sm-color-surface": colors.surface,
    "--sm-color-fg": colors.foreground,
    "--sm-color-muted": colors.muted,
    "--sm-color-border": colors.border,
    "--sm-color-primary": colors.primary,
    "--sm-color-primary-fg": readableTextOn(colors.primary),
    "--sm-color-accent": colors.accent,
    "--sm-color-accent-fg": readableTextOn(colors.accent),
    // Accent used as text (eyebrows, icons, links) — contrast-corrected.
    "--sm-color-accent-text": ensureContrast(colors.accent, colors.background, colors.foreground),
    "--sm-color-primary-text": ensureContrast(colors.primary, colors.background, colors.foreground),
    "--sm-font-display": displayFont,
    "--sm-font-body": BODY_FONT,
    "--sm-radius-sm": theme.radius.sm,
    "--sm-radius-md": theme.radius.md,
    "--sm-radius-lg": theme.radius.lg,
    "--sm-radius-button": BUTTON_RADIUS[theme.button],
  };
}
