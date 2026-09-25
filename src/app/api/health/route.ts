/** Liveness probe for the process manager / load balancer. */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
