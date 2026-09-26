import { expect, test } from "@playwright/test";

import { CONSOLE, USERS, expectNoA11yViolations, expectNoHorizontalOverflow, signIn } from "./helpers";

test.describe("admin console", () => {
  test("requires sign-in", async ({ page }) => {
    await page.goto(`${CONSOLE}/en/t/roasters`);
    await expect(page).toHaveURL(`${CONSOLE}/en/login`);
    await expectNoA11yViolations(page);
  });

  test("rejects a wrong password", async ({ page }) => {
    await page.goto(`${CONSOLE}/en/login`);
    await page.getByLabel("Email").fill(USERS.ownerA.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
    await expect(page).toHaveURL(`${CONSOLE}/en/login`);
  });

  test("owner of Tenant A sees their dashboard and plan modules", async ({ page, isMobile }) => {
    await signIn(page, USERS.ownerA);
    await expect(page).toHaveURL(`${CONSOLE}/en/t/roasters`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roasters Café");
    await expect(page.getByText("No orders yet")).toBeVisible();

    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    // Professional plan: booking and subscriptions are included.
    await expect(nav.getByRole("link", { name: "Bookings" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("owner of Tenant A cannot open Tenant B's console", async ({ page }) => {
    await signIn(page, USERS.ownerA);
    const response = await page.goto(`${CONSOLE}/en/t/coffeehouse`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Maison Coffeehouse")).toHaveCount(0);

    const platform = await page.goto(`${CONSOLE}/en/platform`);
    expect(platform?.status()).toBe(404);
  });

  test("Starter plan hides modules it does not include", async ({ page, isMobile }) => {
    await signIn(page, USERS.ownerB);
    await expect(page).toHaveURL(`${CONSOLE}/en/t/coffeehouse`);
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Bookings" })).toHaveCount(0);

    await page.goto(`${CONSOLE}/en/t/coffeehouse/bookings`);
    await expect(page.getByText("Bookings is not included in your plan")).toBeVisible();
  });

  test("staff only see what their role allows", async ({ page, isMobile }) => {
    await signIn(page, USERS.staffA);
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await page.goto(`${CONSOLE}/en/t/roasters/settings`);
    await expect(page.getByRole("alert").filter({ hasText: "You don’t have access" })).toBeVisible();
  });

  test("unbuilt modules say so instead of pretending to work", async ({ page }) => {
    await signIn(page, USERS.ownerA);
    await page.goto(`${CONSOLE}/en/t/roasters/orders`);
    await expect(page.getByText("Orders is not available yet")).toBeVisible();
  });

  test("platform admin sees every business", async ({ page }) => {
    await signIn(page, USERS.platform);
    await page.getByRole("link", { name: "Platform admin" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Platform administration");
    const table = page.getByRole("table");
    await expect(table).toContainText("Roasters Café");
    await expect(table).toContainText("Maison Coffeehouse");
    await expect(table).toContainText("Professional");
    await expect(table).toContainText("Starter");
  });

  test("Arabic console is right-to-left with the sidebar on the right", async ({ page, isMobile }) => {
    test.skip(isMobile, "Sidebar is a drawer on mobile");
    await signIn(page, USERS.ownerA, "ar");
    await expect(page).toHaveURL(`${CONSOLE}/ar/t/roasters`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("لوحة التحكم").first()).toBeVisible();
    const box = await page.locator("aside").boundingBox();
    const width = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThan(width / 2);
    await expectNoA11yViolations(page);
  });

  test("dashboard is accessible and fits small screens", async ({ page }) => {
    await signIn(page, USERS.ownerA, "fr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roasters Café");
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
  });

  test("signing out ends the session", async ({ page, isMobile }) => {
    await signIn(page, USERS.ownerA);
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await expect(page).toHaveURL(`${CONSOLE}/en/login`);
    await page.goto(`${CONSOLE}/en/t/roasters`);
    await expect(page).toHaveURL(`${CONSOLE}/en/login`);
  });
});
