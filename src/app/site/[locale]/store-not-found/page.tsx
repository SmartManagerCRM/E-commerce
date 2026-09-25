import { notFound } from "next/navigation";

/** Target of the proxy rewrite for hostnames that match no tenant. Always 404. */
export default function StoreNotFoundPage() {
  notFound();
}
