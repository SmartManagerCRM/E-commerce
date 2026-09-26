import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

/**
 * Renders tenant-configured links safely: internal paths go through the
 * locale-aware Link, anchors and tel/mailto are plain, external https links
 * open in a new tab without leaking the opener.
 */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  if (href.startsWith("https://")) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
