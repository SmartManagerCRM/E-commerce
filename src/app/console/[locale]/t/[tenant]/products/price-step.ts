/** `step` attribute for a price input in a currency with `exponent` decimals. */
export function priceStep(exponent: number): string {
  return exponent > 0 ? `0.${"0".repeat(exponent - 1)}1` : "1";
}
