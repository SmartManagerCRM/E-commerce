/**
 * Admin console module registry. Visibility of every module is derived from
 * data — the tenant's plan entitlements (`feature`) and the member's role
 * (`permission`) — never from hard-coded tenant or plan checks.
 */
export type AdminSection = "main" | "catalog" | "sales" | "marketing" | "business";

export type AdminModule = {
  key: string;
  section: AdminSection;
  /** Entitlement required (features table); null = always available. */
  feature: string | null;
  /** Permission required to see the module. */
  permission: string;
  /** Whether the module is implemented in the current release. */
  available: boolean;
};

export const ADMIN_MODULES = [
  { key: "dashboard", section: "main", feature: null, permission: "dashboard.read", available: true },
  { key: "orders", section: "sales", feature: "orders", permission: "orders.read", available: false },
  { key: "customers", section: "sales", feature: "customers", permission: "customers.read", available: false },
  { key: "bookings", section: "sales", feature: "booking", permission: "bookings.read", available: false },
  {
    key: "subscriptions",
    section: "sales",
    feature: "product_subscriptions",
    permission: "subscriptions.read",
    available: false,
  },
  { key: "products", section: "catalog", feature: "catalog", permission: "catalog.read", available: true },
  { key: "categories", section: "catalog", feature: "catalog", permission: "catalog.read", available: true },
  { key: "inventory", section: "catalog", feature: "inventory", permission: "inventory.read", available: true },
  { key: "coupons", section: "marketing", feature: "coupons", permission: "marketing.read", available: false },
  { key: "promotions", section: "marketing", feature: "promotions", permission: "marketing.read", available: false },
  { key: "loyalty", section: "marketing", feature: "loyalty", permission: "marketing.read", available: false },
  { key: "analytics", section: "business", feature: "basic_analytics", permission: "analytics.read", available: false },
  { key: "appearance", section: "business", feature: null, permission: "appearance.read", available: true },
  { key: "staff", section: "business", feature: null, permission: "staff.read", available: true },
  { key: "settings", section: "business", feature: null, permission: "settings.read", available: true },
] as const satisfies readonly AdminModule[];

export type AdminModuleKey = (typeof ADMIN_MODULES)[number]["key"];

export const ADMIN_SECTIONS: readonly AdminSection[] = ["main", "sales", "catalog", "marketing", "business"];

export type AdminAccess = {
  permissions: readonly string[];
  features: Readonly<Record<string, { enabled: boolean; limit: number | null }>>;
};

export function findAdminModule(key: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.key === key);
}

export function isFeatureEnabled(access: AdminAccess, feature: string | null): boolean {
  return feature === null || access.features[feature]?.enabled === true;
}

export function canSeeModule(module: AdminModule, access: AdminAccess): boolean {
  return isFeatureEnabled(access, module.feature) && access.permissions.includes(module.permission);
}

/** Modules the member can see, grouped by section in display order. */
export function visibleModulesBySection(access: AdminAccess): { section: AdminSection; modules: AdminModule[] }[] {
  return ADMIN_SECTIONS.map((section) => ({
    section,
    modules: ADMIN_MODULES.filter((m) => m.section === section && canSeeModule(m, access)),
  })).filter((group) => group.modules.length > 0);
}
