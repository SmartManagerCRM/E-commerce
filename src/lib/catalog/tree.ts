/**
 * Category tree in display order: each parent followed by its children,
 * depth-first, keeping the incoming (position) order. Rows whose parent is
 * missing are treated as top level.
 */
export function treeOrder<T extends { id: string; parent_id: string | null }>(rows: T[]): { row: T; depth: number }[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent = row.parent_id && ids.has(row.parent_id) ? row.parent_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), row]);
  }
  const result: { row: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      result.push({ row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

/** Ids of a category and all its descendants (a category cannot move under these). */
export function descendantsOf<T extends { id: string; parent_id: string | null }>(rows: T[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parent_id && result.has(row.parent_id) && !result.has(row.id)) {
        result.add(row.id);
        grew = true;
      }
    }
  }
  return result;
}
