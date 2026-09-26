import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { SectionProps } from "@/lib/storefront/sections";

import { MediaImage } from "../media-image";
import { text, type SectionContext } from "./types";

export function BrandStorySection({ props, ctx }: { props: SectionProps<"brand_story">; ctx: SectionContext }) {
  const body = text(ctx, props.body);
  const title = text(ctx, props.title);
  if (!body && !title) return null;
  const headingId = ctx.anchor ? `${ctx.anchor}-title` : undefined;
  return (
    <section id={ctx.anchor} aria-labelledby={title ? headingId : undefined} className="scroll-mt-24">
      <Container className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-20">
        <MediaImage
          path={props.image_path}
          alt=""
          sizes="(min-width: 1024px) 50vw, 100vw"
          aspect="aspect-[4/3] lg:aspect-[4/5]"
          className={cn("rounded-lg", props.variant === "image_end" && "lg:order-last")}
        />
        <div>
          {text(ctx, props.eyebrow) ? (
            <p className="mb-3 text-xs font-medium tracking-[0.2em] text-accent-text uppercase rtl:tracking-normal">
              {text(ctx, props.eyebrow)}
            </p>
          ) : null}
          {title ? (
            <h2 id={headingId} className="font-display text-display-md font-semibold text-balance rtl:leading-snug">
              {title}
            </h2>
          ) : null}
          {body ? (
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted text-pretty">
              {body.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
