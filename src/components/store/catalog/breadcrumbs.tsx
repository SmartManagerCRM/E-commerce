import { ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation";

export type Crumb = { label: string; href?: string };

/** Visible breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-fg hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
