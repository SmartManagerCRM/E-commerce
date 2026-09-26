import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import type { SectionProps } from "@/lib/storefront/sections";

import { MediaImage } from "../media-image";
import { SmartLink } from "../smart-link";
import { text, type SectionContext } from "./types";

export function HeroSection({ props, ctx }: { props: SectionProps<"hero">; ctx: SectionContext }) {
  const eyebrow = text(ctx, props.eyebrow);
  const title = text(ctx, props.title) || ctx.tenant.business_name;
  const subtitle = text(ctx, props.subtitle);
  const ctaLabel = props.cta ? text(ctx, props.cta.label) : "";
  const variant = props.variant === "image" && !props.image_path ? "centered" : props.variant;

  const cta =
    props.cta && ctaLabel ? (
      <SmartLink href={props.cta.href} className={buttonClasses(variant === "image" ? "secondary" : "primary", "lg")}>
        {ctaLabel}
      </SmartLink>
    ) : null;

  const copy = (onImage: boolean) => (
    <>
      {eyebrow ? (
        <p
          className={cn(
            "mb-5 text-xs font-medium tracking-[0.22em] uppercase sm:text-sm rtl:tracking-normal",
            onImage ? "text-white/85" : "text-accent-text",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-display-xl font-semibold text-balance rtl:leading-[1.3]">{title}</h1>
      {subtitle ? (
        <p
          className={cn("mt-6 max-w-xl text-lg leading-relaxed text-pretty", onImage ? "text-white/85" : "text-muted")}
        >
          {subtitle}
        </p>
      ) : null}
      {cta ? <div className="mt-9">{cta}</div> : null}
    </>
  );

  if (variant === "image") {
    return (
      <section className="relative isolate overflow-hidden text-white">
        <MediaImage path={props.image_path} alt="" sizes="100vw" priority aspect="absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/30 to-black/10"
        />
        <Container className="flex min-h-[72svh] items-end pt-32 pb-14 sm:pb-20">
          <div className="max-w-3xl">{copy(true)}</div>
        </Container>
      </section>
    );
  }

  if (variant === "centered") {
    return (
      <section className="border-b border-border">
        <Container className="flex flex-col items-center py-20 text-center sm:py-28">
          <div className="flex max-w-3xl flex-col items-center [&_p]:mx-auto">{copy(false)}</div>
        </Container>
        {props.image_path ? (
          <Container className="pb-16 sm:pb-24">
            <MediaImage
              path={props.image_path}
              alt=""
              sizes="(min-width: 1280px) 1216px, 100vw"
              priority
              aspect="aspect-[16/9] sm:aspect-[21/9]"
              className="rounded-lg"
            />
          </Container>
        ) : null}
      </section>
    );
  }

  return (
    <section className="border-b border-border">
      <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-16 lg:py-24">
        <div className={props.image_path ? "lg:col-span-6" : "lg:col-span-9"}>{copy(false)}</div>
        {props.image_path ? (
          <div className="lg:col-span-6">
            <MediaImage
              path={props.image_path}
              alt=""
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
              aspect="aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]"
              className="rounded-lg"
            />
          </div>
        ) : null}
      </Container>
    </section>
  );
}
