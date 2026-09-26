import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import type { SectionProps } from "@/lib/storefront/sections";

import { NewsletterForm } from "../newsletter-form";
import { text, type SectionContext } from "./types";

export async function NewsletterSection({ props, ctx }: { props: SectionProps<"newsletter">; ctx: SectionContext }) {
  const t = await getTranslations("store.sections");
  return (
    <section id={ctx.anchor} aria-labelledby="newsletter-title" className="scroll-mt-24 bg-primary text-primary-fg">
      <Container className="grid gap-8 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <h2
            id="newsletter-title"
            className="font-display text-display-md font-semibold text-balance rtl:leading-snug"
          >
            {text(ctx, props.title) || t("newsletterTitle")}
          </h2>
          <p className="mt-3 max-w-lg opacity-85">{text(ctx, props.subtitle) || t("newsletterSubtitle")}</p>
        </div>
        <NewsletterForm businessName={ctx.tenant.business_name} />
      </Container>
    </section>
  );
}
