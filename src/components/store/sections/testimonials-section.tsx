import { Quote } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import type { SectionProps } from "@/lib/storefront/sections";

import { SectionHeading } from "../section-heading";
import { text, type SectionContext } from "./types";

export async function TestimonialsSection({
  props,
  ctx,
}: {
  props: SectionProps<"testimonials">;
  ctx: SectionContext;
}) {
  const t = await getTranslations("store.sections");
  const items = props.items.filter((item) => text(ctx, item.quote));
  if (items.length === 0) return null;
  return (
    <section
      id={ctx.anchor}
      aria-labelledby="testimonials-title"
      className="scroll-mt-24 border-y border-border bg-surface"
    >
      <Container className="py-16 sm:py-24">
        <SectionHeading
          id="testimonials-title"
          title={text(ctx, props.title) || t("testimonialsTitle")}
          align="center"
        />
        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <li key={i}>
              <figure className="flex h-full flex-col rounded-lg border border-border bg-bg p-6 sm:p-8">
                <Quote className="size-6 text-accent-text rtl:-scale-x-100" aria-hidden="true" />
                <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-pretty">
                  {text(ctx, item.quote)}
                </blockquote>
                <figcaption className="mt-6 text-sm">
                  <span className="font-semibold">{item.author}</span>
                  {text(ctx, item.detail) ? <span className="text-muted"> · {text(ctx, item.detail)}</span> : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
