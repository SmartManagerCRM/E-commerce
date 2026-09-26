import { useTranslations } from "next-intl";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/commerce/orders";

const TONE: Record<OrderStatus, BadgeTone> = {
  pending: "primary",
  confirmed: "outline",
  preparing: "outline",
  ready: "success",
  out_for_delivery: "success",
  completed: "neutral",
  cancelled: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("orderStatus");
  return <Badge tone={TONE[status] ?? "neutral"}>{t(status)}</Badge>;
}
