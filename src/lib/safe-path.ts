/** Accepts only same-origin relative paths (blocks `//evil.com`, `/\\evil.com`, schemes). */
export function safeRelativePath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  return /^\/(?![/\\])[^\s\\]*$/.test(value) && value.length <= 512 ? value : fallback;
}
