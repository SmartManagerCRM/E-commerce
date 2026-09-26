"use client";

import { useRouter } from "@/i18n/navigation";

/**
 * Sort control: a select that navigates on change. Each option also has a
 * real URL, and the filter form carries the sort, so it degrades gracefully.
 */
export function SortSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const option = options.find((o) => o.value === event.target.value);
          if (option) router.push(option.href, { scroll: false });
        }}
        className="h-10 rounded-md border border-border bg-surface px-3 text-base sm:text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
