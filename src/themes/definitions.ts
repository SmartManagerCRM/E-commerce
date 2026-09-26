/**
 * Theme definitions. A theme is a set of design-token values plus layout
 * variant choices; components never hard-code colors, fonts or radii — they
 * read the CSS variables produced from these tokens (see `tokens.ts`).
 *
 * Add a theme by adding an entry here; no component changes are needed.
 */
export type FontRole = "serif-display" | "classic-serif" | "sans";

export type ThemeColors = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  primary: string;
  accent: string;
};

export type ThemeDefinition = {
  key: string;
  label: string;
  displayFont: FontRole;
  bodyFont: "sans";
  colors: ThemeColors;
  radius: { sm: string; md: string; lg: string };
  button: "pill" | "rounded" | "square";
  heroLayout: "editorial" | "bold" | "clean" | "minimal";
  productCard: "minimal" | "bordered" | "elevated";
  headerLayout: "classic" | "centered";
};

export const THEMES = {
  "premium-cafe": {
    key: "premium-cafe",
    label: "Premium Café",
    displayFont: "serif-display",
    bodyFont: "sans",
    colors: {
      background: "#FBF8F3",
      surface: "#FFFFFF",
      foreground: "#231A14",
      muted: "#6F6259",
      border: "#E7DED3",
      primary: "#5C3A21",
      accent: "#B8875A",
    },
    radius: { sm: "0.25rem", md: "0.5rem", lg: "0.75rem" },
    button: "rounded",
    heroLayout: "editorial",
    productCard: "minimal",
    headerLayout: "classic",
  },
  "modern-restaurant": {
    key: "modern-restaurant",
    label: "Modern Restaurant",
    displayFont: "sans",
    bodyFont: "sans",
    colors: {
      background: "#FFFCF8",
      surface: "#FFFFFF",
      foreground: "#1B1B1B",
      muted: "#61605C",
      border: "#ECE6DE",
      primary: "#B6361F",
      accent: "#E3A33B",
    },
    radius: { sm: "0.375rem", md: "0.75rem", lg: "1rem" },
    button: "pill",
    heroLayout: "bold",
    productCard: "elevated",
    headerLayout: "classic",
  },
  "modern-retail": {
    key: "modern-retail",
    label: "Modern Retail",
    displayFont: "sans",
    bodyFont: "sans",
    colors: {
      background: "#FFFFFF",
      surface: "#F7F7F5",
      foreground: "#141414",
      muted: "#5F6368",
      border: "#E5E5E2",
      primary: "#141414",
      accent: "#2F6F5E",
    },
    radius: { sm: "0.125rem", md: "0.25rem", lg: "0.5rem" },
    button: "square",
    heroLayout: "clean",
    productCard: "bordered",
    headerLayout: "classic",
  },
  luxury: {
    key: "luxury",
    label: "Luxury",
    displayFont: "classic-serif",
    bodyFont: "sans",
    colors: {
      background: "#FAF9F7",
      surface: "#FFFFFF",
      foreground: "#111111",
      muted: "#6B6760",
      border: "#E4E0D9",
      primary: "#111111",
      accent: "#A08553",
    },
    radius: { sm: "0", md: "0", lg: "0.125rem" },
    button: "square",
    heroLayout: "minimal",
    productCard: "minimal",
    headerLayout: "centered",
  },
  beauty: {
    key: "beauty",
    label: "Beauty",
    displayFont: "classic-serif",
    bodyFont: "sans",
    colors: {
      background: "#FCF8F6",
      surface: "#FFFFFF",
      foreground: "#2A2024",
      muted: "#75676C",
      border: "#EFE3DF",
      primary: "#8E4C5E",
      accent: "#D7A99A",
    },
    radius: { sm: "0.375rem", md: "0.75rem", lg: "1.25rem" },
    button: "pill",
    heroLayout: "editorial",
    productCard: "minimal",
    headerLayout: "centered",
  },
} as const satisfies Record<string, ThemeDefinition>;

export type ThemeKey = keyof typeof THEMES;

export const DEFAULT_THEME: ThemeKey = "premium-cafe";

export function getTheme(key: string | null | undefined): ThemeDefinition {
  return key && key in THEMES ? THEMES[key as ThemeKey] : THEMES[DEFAULT_THEME];
}
