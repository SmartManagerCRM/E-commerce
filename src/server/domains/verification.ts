import "server-only";

import { resolveTxt } from "node:dns/promises";

/**
 * Custom-domain ownership check: the tenant publishes a TXT record
 *   _smartmanager-verify.<hostname>  =  smartmanager-verify=<token>
 * DNS is queried server-side; the client's claim is never trusted.
 */
export const VERIFICATION_PREFIX = "_smartmanager-verify";

export function verificationRecord(hostname: string, token: string) {
  return { name: `${VERIFICATION_PREFIX}.${hostname}`, value: `smartmanager-verify=${token}` };
}

export type TxtResolver = (name: string) => Promise<string[][]>;

export type VerificationResult =
  { verified: true } | { verified: false; reason: "not_found" | "mismatch" | "dns_error" };

export async function checkDomainOwnership(
  hostname: string,
  token: string,
  resolver: TxtResolver = resolveTxt,
): Promise<VerificationResult> {
  const { name, value } = verificationRecord(hostname, token);
  let records: string[][];
  try {
    records = await resolver(name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { verified: false, reason: code === "ENOTFOUND" || code === "ENODATA" ? "not_found" : "dns_error" };
  }
  // TXT records may be split into several character-strings; join each record.
  const values = records.map((chunks) => chunks.join("").trim());
  return values.includes(value) ? { verified: true } : { verified: false, reason: "mismatch" };
}
