import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "start" | "center";
  className?: string;
};

/** Consistent section titles across themes: eyebrow, display title, lead. */
export function SectionHeading({ id, eyebrow, title, description, align = "start", className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-accent-text uppercase rtl:tracking-normal">
          {eyebrow}
        </p>
      ) : null}
      <h2 id={id} className="font-display text-display-md font-semibold text-balance rtl:leading-snug">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-muted text-pretty">{description}</p> : null}
    </div>
  );
}
