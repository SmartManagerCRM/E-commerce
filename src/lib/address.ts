/** Formats a stored address object (`{ line1, line2, city, postal_code, country }`) on one line. */
export function formatAddress(address: Record<string, unknown> | null | undefined): string {
  if (!address) return "";
  return ["line1", "line2", "city", "postal_code"]
    .map((key) => address[key])
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(", ");
}
