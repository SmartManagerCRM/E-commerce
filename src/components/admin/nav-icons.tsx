import {
  BarChart3,
  CalendarDays,
  Boxes,
  FolderTree,
  Gift,
  LayoutDashboard,
  Megaphone,
  Package,
  Palette,
  Repeat,
  Settings,
  ShoppingBag,
  TicketPercent,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AdminModuleKey } from "@/lib/admin/modules";

export const NAV_ICONS: Record<AdminModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingBag,
  customers: Users,
  bookings: CalendarDays,
  subscriptions: Repeat,
  products: Package,
  categories: FolderTree,
  inventory: Boxes,
  coupons: TicketPercent,
  promotions: Megaphone,
  loyalty: Gift,
  analytics: BarChart3,
  appearance: Palette,
  staff: UserCog,
  settings: Settings,
};
