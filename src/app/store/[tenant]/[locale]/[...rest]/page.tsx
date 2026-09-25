import { notFound } from "next/navigation";

/** Unknown storefront paths render the storefront's own 404 (with header and footer). */
export default function StoreCatchAll() {
  notFound();
}
