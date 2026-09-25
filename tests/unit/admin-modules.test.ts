import { describe, expect, it } from "vitest";

import { canSeeModule, findAdminModule, visibleModulesBySection, type AdminAccess } from "@/lib/admin/modules";

const features = (enabled: string[]): AdminAccess["features"] =>
  Object.fromEntries(enabled.map((key) => [key, { enabled: true, limit: null }]));

describe("admin module visibility", () => {
  it("hides modules the plan does not include", () => {
    const access: AdminAccess = { permissions: ["bookings.read"], features: features(["orders"]) };
    expect(canSeeModule(findAdminModule("bookings")!, access)).toBe(false);
  });

  it("hides modules the role lacks permission for", () => {
    const access: AdminAccess = { permissions: ["dashboard.read"], features: features(["booking"]) };
    expect(canSeeModule(findAdminModule("bookings")!, access)).toBe(false);
  });

  it("shows modules with both entitlement and permission", () => {
    const access: AdminAccess = { permissions: ["bookings.read"], features: features(["booking"]) };
    expect(canSeeModule(findAdminModule("bookings")!, access)).toBe(true);
  });

  it("groups visible modules by section in order and drops empty sections", () => {
    const access: AdminAccess = {
      permissions: ["dashboard.read", "orders.read", "settings.read"],
      features: features(["orders"]),
    };
    expect(visibleModulesBySection(access).map((g) => [g.section, g.modules.map((m) => m.key)])).toEqual([
      ["main", ["dashboard"]],
      ["sales", ["orders"]],
      ["business", ["settings"]],
    ]);
  });
});
