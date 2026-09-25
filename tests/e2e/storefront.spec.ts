import { expect, test } from "@playwright/test";

import { STORE_A, STORE_B, expectNoA11yViolations, expectNoHorizontalOverflow } from "./helpers";

test.describe("storefront tenant resolution", () => {
  test.describe("without a supported browser language", () => {
    // The tenant's default language applies when the browser prefers none of its languages.
    test.use({ locale: "de-DE" });

    test("Tenant A defaults to Arabic with RTL layout and its own branding", async ({ page }) => {
      await page.goto(`${STORE_A}/`);
      await expect(page).toHaveURL(`${STORE_A}/ar`);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Roasters Café");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("أهلاً بكم");
      const primary = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--sm-color-primary").trim(),
      );
      expect(primary).toBe("#6B3F24");
      await expectNoHorizontalOverflow(page);
    });

    test("Tenant B defaults to French and never offers Arabic", async ({ page }) => {
      await page.goto(`${STORE_B}/`);
      await expect(page).toHaveURL(`${STORE_B}/fr`);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Bienvenue chez Maison Coffeehouse");
      await expect(page.locator('a[hreflang="ar"]')).toHaveCount(0);
      const primary = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--sm-color-primary").trim(),
      );
      expect(primary).toBe("#1F3A34");

      // A disabled locale in the URL is replaced by an enabled one.
      await page.goto(`${STORE_B}/ar`);
      await expect(page).toHaveURL(`${STORE_B}/fr`);
    });
  });

  test("the visitor's browser language wins over the tenant default when enabled", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto(`${STORE_A}/`);
    await expect(page).toHaveURL(`${STORE_A}/en`);
    await context.close();
  });

  test("tenants never leak into each other", async ({ page }) => {
    await page.goto(`${STORE_A}/en`);
    await expect(page.getByText("Maison Coffeehouse")).toHaveCount(0);
    await page.goto(`${STORE_B}/en`);
    await expect(page.getByText("Roasters Café")).toHaveCount(0);

    // Internal route paths cannot be used to reach another tenant.
    const response = await page.goto(`${STORE_A}/en/store/coffeehouse/en`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Maison Coffeehouse")).toHaveCount(0);
  });

  test("custom domains resolve to their tenant", async ({ page }) => {
    await page.goto("http://roasters.test:3000/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to Roasters Café");
  });

  test("unknown hosts get a 404 instead of another store", async ({ page }) => {
    const response = await page.goto("http://unknown-shop.test:3000/en");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Store not found");
  });

  test("language switch keeps the page and query string", async ({ page }) => {
    await page.goto(`${STORE_A}/ar?ref=qr`);
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(`${STORE_A}/en?ref=qr`);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Roasters Café");

    await page.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(`${STORE_A}/fr?ref=qr`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bienvenue chez Roasters Café");

    // The choice is remembered for visits without a locale.
    await page.goto(`${STORE_A}/`);
    await expect(page).toHaveURL(`${STORE_A}/fr`);
  });

  test("unknown storefront pages render the store's own 404", async ({ page }) => {
    const response = await page.goto(`${STORE_A}/en/does-not-exist`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByRole("banner")).toContainText("Roasters Café");
  });

  test("storefront has tenant-specific SEO metadata", async ({ page }) => {
    await page.goto(`${STORE_A}/en`);
    await expect(page).toHaveTitle("Roasters Café");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Specialty coffee/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://roasters.test/en");
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute(
      "href",
      "https://roasters.test/ar",
    );
  });

  for (const locale of ["en", "fr", "ar"]) {
    test(`storefront is accessible in ${locale}`, async ({ page }) => {
      await page.goto(`${STORE_A}/${locale}`);
      await expectNoA11yViolations(page);
      await expectNoHorizontalOverflow(page);
    });
  }
});
