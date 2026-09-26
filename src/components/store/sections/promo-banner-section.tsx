import { ArrowRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { SectionProps } from "@/lib/storefront/sections";

import { SmartLink } from "../smart-link";
import { text, type SectionContext } from "./types";

const TONES = {
  primary: "bg-primary text-primary-fg",
  accent: "bg-accent text-accent-fg",
  dark: "bg-fg text-bg",
} as const;

export function PromoBannerSection({ props, ctx }: { props: SectionProps<"promo_banner">; ctx: SectionContext }) {
  const message = text(ctx, props.text);
  if (!message) return null;
  const label = props.cta ? text(ctx, props.cta.label) : "";
  return (
    <section className={cn(TONES[props.tone])}>
      <Container className="flex flex-col items-start gap-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
        <p className="font-display text-2xl font-semibold text-balance sm:text-3xl rtl:leading-snug">{message}</p>
        {props.cta && label ? (
          <SmartLink
            href={props.cta.href}
            className="inline-flex shrink-0 items-center gap-2 border-b border-current pb-0.5 text-sm font-medium"
          >
            {label}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </SmartLink>
        ) : null}
      </Container>
    </section>
  );
}
