import { Cormorant_Garamond, Fraunces, IBM_Plex_Sans_Arabic, Inter, Noto_Kufi_Arabic } from "next/font/google";

/**
 * Self-hosted font families (downloaded at build time by next/font, served
 * from our own origin — no runtime requests to Google).
 * Latin families are listed first in each stack; Arabic glyphs fall through
 * to the Arabic family automatically.
 */
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const kufiArabic = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["500", "600", "700"],
  variable: "--font-arabic-display",
  display: "swap",
});

/** Font variable classes for a storefront, limited to what the theme uses. */
export function storefrontFontClasses(displayFont: "serif-display" | "classic-serif" | "sans", rtl: boolean): string {
  const classes = [inter.variable];
  if (displayFont === "serif-display") classes.push(fraunces.variable);
  if (displayFont === "classic-serif") classes.push(cormorant.variable);
  if (rtl) classes.push(plexArabic.variable, kufiArabic.variable);
  return classes.join(" ");
}

export function consoleFontClasses(rtl: boolean): string {
  return rtl ? `${inter.variable} ${plexArabic.variable}` : inter.variable;
}
