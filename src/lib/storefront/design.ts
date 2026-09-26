import { z } from "zod";

import { asLocalizedText, type LocalizedText } from "@/lib/localized";
import { getTheme, type FontRole, type ThemeDefinition } from "@/themes/definitions";

/**
 * Tenant design customisation on top of a theme. Stored in
 * storefront_configs.tokens / header / footer and validated here.
 */
export const TYPOGRAPHY_OPTIONS = ["theme", "serif-display", "classic-serif", "sans"] as const;
export const BUTTON_OPTIONS = ["theme", "pill", "rounded", "square"] as const;
export const CARD_OPTIONS = ["theme", "minimal", "bordered", "elevated"] as const;
export const HEADER_LAYOUTS = ["theme", "classic", "centered"] as const;
export const SOCIAL_NETWORKS = ["instagram", "tiktok", "x", "snapchat", "facebook", "whatsapp"] as const;

export type CardStyle = Exclude<(typeof CARD_OPTIONS)[number], "theme">;
export type HeaderLayout = Exclude<(typeof HEADER_LAYOUTS)[number], "theme">;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const designTokensSchema = z.object({
  typography: z.enum(TYPOGRAPHY_OPTIONS).catch("theme"),
  buttons: z.enum(BUTTON_OPTIONS).catch("theme"),
  cards: z.enum(CARD_OPTIONS).catch("theme"),
});

export const headerConfigSchema = z.object({
  layout: z.enum(HEADER_LAYOUTS).catch("theme"),
  sticky: z.boolean().catch(true),
  announcement: z
    .record(z.string(), z.unknown())
    .catch({})
    .transform((v) => asLocalizedText(v)),
});

/** Social handles/URLs: stored as full https URLs (or wa.me for WhatsApp). */
export const socialUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "invalid");

export const footerConfigSchema = z.object({
  social: z
    .object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, socialUrlSchema.optional().catch(undefined)])))
    .partial()
    .catch({}),
});

export type StorefrontDesign = {
  theme: ThemeDefinition;
  fontRole: FontRole;
  button: ThemeDefinition["button"];
  card: CardStyle;
  headerLayout: HeaderLayout;
  stickyHeader: boolean;
  announcement: LocalizedText;
  social: Partial<Record<SocialNetwork, string>>;
};

export function resolveStorefrontDesign(config: {
  theme_key: string;
  tokens: unknown;
  header: unknown;
  footer: unknown;
}): StorefrontDesign {
  const theme = getTheme(config.theme_key);
  const tokens = designTokensSchema.parse(config.tokens ?? {});
  const header = headerConfigSchema.parse(config.header ?? {});
  const footer = footerConfigSchema.parse(config.footer ?? {});
  const social = Object.fromEntries(
    Object.entries(footer.social).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  ) as Partial<Record<SocialNetwork, string>>;

  return {
    theme,
    fontRole: tokens.typography === "theme" ? theme.displayFont : tokens.typography,
    button: tokens.buttons === "theme" ? theme.button : tokens.buttons,
    card: tokens.cards === "theme" ? theme.productCard : tokens.cards,
    headerLayout: header.layout === "theme" ? theme.headerLayout : header.layout,
    stickyHeader: header.sticky,
    announcement: header.announcement,
    social,
  };
}
