import type { Section, SectionType } from "@/lib/storefront/sections";

import { BrandStorySection } from "./brand-story-section";
import { HeroSection } from "./hero-section";
import { LocationSection } from "./location-section";
import { NewsletterSection } from "./newsletter-section";
import { PromoBannerSection } from "./promo-banner-section";
import { TestimonialsSection } from "./testimonials-section";
import type { SectionContext } from "./types";

/** Anchors used by header navigation for the first section of each type. */
export const SECTION_ANCHORS: Partial<Record<SectionType, string>> = {
  brand_story: "story",
  testimonials: "reviews",
  location: "visit",
  newsletter: "newsletter",
};

export function anchorsFor(sections: Section[]): Map<string, string> {
  const seen = new Set<SectionType>();
  const result = new Map<string, string>();
  for (const s of sections) {
    const anchor = SECTION_ANCHORS[s.type];
    if (s.enabled && anchor && !seen.has(s.type)) {
      seen.add(s.type);
      result.set(s.id, anchor);
    }
  }
  return result;
}

export function RenderSections({ sections, ctx }: { sections: Section[]; ctx: Omit<SectionContext, "anchor"> }) {
  const anchors = anchorsFor(sections);
  return (
    <>
      {sections
        .filter((s) => s.enabled)
        .map((s) => {
          const sctx = { ...ctx, anchor: anchors.get(s.id) };
          switch (s.type) {
            case "hero":
              return <HeroSection key={s.id} props={s.props} ctx={sctx} />;
            case "promo_banner":
              return <PromoBannerSection key={s.id} props={s.props} ctx={sctx} />;
            case "brand_story":
              return <BrandStorySection key={s.id} props={s.props} ctx={sctx} />;
            case "testimonials":
              return <TestimonialsSection key={s.id} props={s.props} ctx={sctx} />;
            case "location":
              return <LocationSection key={s.id} props={s.props} ctx={sctx} />;
            case "newsletter":
              return <NewsletterSection key={s.id} props={s.props} ctx={sctx} />;
            default:
              return null;
          }
        })}
    </>
  );
}
