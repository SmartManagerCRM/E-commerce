/**
 * Converts FormData into a plain object: dotted names become nested objects
 * (`tagline.ar` → `{ tagline: { ar } }`) and names ending in `[]` become
 * arrays (`enabled_languages[]`). Files are kept as File instances.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [rawKey, value] of formData.entries()) {
    if (rawKey.startsWith("$ACTION")) continue;
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    const path = key.split(".");
    let target = result;
    for (const segment of path.slice(0, -1)) {
      target[segment] ??= {};
      target = target[segment] as Record<string, unknown>;
    }
    const leaf = path[path.length - 1];
    if (isArray) {
      ((target[leaf] ??= []) as unknown[]).push(value);
    } else {
      target[leaf] = value;
    }
  }
  return result;
}
