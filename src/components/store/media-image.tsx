import Image from "next/image";

import { cn } from "@/lib/cn";
import { publicMediaUrl } from "@/lib/storage";

type MediaImageProps = {
  path: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Tailwind aspect-ratio class for the frame, e.g. "aspect-[4/5]". */
  aspect: string;
};

/**
 * Responsive, lazy-loaded tenant image (AVIF/WebP via next/image) in a
 * fixed-ratio frame so layouts never shift. Without an image it renders a
 * quiet tinted surface instead of a broken picture.
 */
export function MediaImage({ path, alt, sizes, priority, className, aspect }: MediaImageProps) {
  const src = publicMediaUrl(path);
  return (
    <div className={cn("relative overflow-hidden bg-fg/[0.04]", aspect, className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_10%,color-mix(in_srgb,var(--color-accent)_22%,transparent),transparent_60%),radial-gradient(90%_70%_at_90%_90%,color-mix(in_srgb,var(--color-primary)_18%,transparent),transparent_60%)]"
        />
      )}
    </div>
  );
}
