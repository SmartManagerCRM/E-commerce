import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { CONSOLE, createActiveTenant, expectNoA11yViolations, signIn, USERS } from "./helpers";

/**
 * Phase 4 console: categories, products (details, photos, options/variants)
 * and inventory on a fresh tenant, checked end to end on its storefront.
 */
test.describe.configure({ mode: "serial" });

const slug = `catalog-${Date.now().toString(36)}`;
let owner: Page;
let storefront = "";
let productUrl = "";

async function expectStorefront(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(`${storefront}${path}`);
    await check();
  }).toPass({ timeout: 75_000, intervals: [1_000, 3_000, 5_000] });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));
});

test("empty catalog pages guide the owner", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/products`);
  await expect(owner.getByText("No products yet")).toBeVisible();
  await expectNoA11yViolations(owner);
  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await expect(owner.getByText("No stock items yet")).toBeVisible();
});

test("owner creates a category", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/categories`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("House coffee");
  await owner.getByRole("button", { name: "Create category" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Category created." })).toBeVisible();
  await expect(owner.getByRole("link", { name: "House coffee" })).toBeVisible();
  await expect(owner.getByText("/shop/house-coffee")).toBeVisible();
  await expectNoA11yViolations(owner);
});

test("owner creates a product and edits its details", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/products/new`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Test Beans");
  // More decimals than the currency allows is blocked before submitting (and rejected by the server).
  await owner.getByLabel("Price (SAR)").fill("12.345");
  expect(await owner.getByLabel("Price (SAR)").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await owner.getByLabel("Price (SAR)").fill("45.5");
  await owner.getByRole("button", { name: "Create product" }).click();
  await owner.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  productUrl = owner.url();
  await expect(owner.getByRole("heading", { level: 1, name: "Test Beans" })).toBeVisible();

  const details = owner.locator("form").filter({ has: owner.getByLabel("Status") });
  await details.getByLabel("Status").selectOption("active");
  await details.getByRole("group", { name: "Short description" }).getByLabel("English").fill("Chocolate, hazelnut");
  await details.getByLabel("House coffee").check();
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(details.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await expectNoA11yViolations(owner);
});

test("owner uploads a photo", async () => {
  const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#8a5a3c" } })
    .png()
    .toBuffer();
  await owner.getByLabel("Add photos").setInputFiles({ name: "beans.png", mimeType: "image/png", buffer: png });
  await owner.getByRole("button", { name: "Upload" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Image uploaded." })).toBeVisible();
  await expect(owner.getByText("Cover", { exact: true })).toBeVisible();
});

test("owner adds options, variant prices and opening stock", async () => {
  await owner.getByRole("button", { name: "Add options (size, colour…)" }).click();
  await owner.getByLabel("Option name (English)").fill("Size");
  await owner.getByLabel("Value 1 (English)").fill("Small");
  await owner.getByRole("button", { name: "Add value" }).click();
  await owner.getByLabel("Value 2 (English)").fill("Large");
  // The original single version is carried over to the first combination.
  await expect(owner.getByLabel("Price – Small")).toHaveValue("45.50");
  await owner.getByLabel("Price – Large").fill("80");
  await owner.getByLabel("SKU – Small").fill("TB-S");
  await owner.getByLabel("SKU – Large").fill("TB-L");
  await owner.getByLabel("Compare at – Large").fill("70");
  await owner.getByRole("button", { name: "Save pricing & options" }).click();
  await expect(owner.getByRole("alert").filter({ hasText: "compare at" })).toBeVisible();

  await owner.getByLabel("Compare at – Large").fill("95");
  await owner.getByLabel("Opening stock – Large").fill("4");
  await owner.getByRole("button", { name: "Save pricing & options" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  // After saving, rows are the saved variants (stock shown, no opening-stock inputs).
  await expect(owner.getByLabel("Opening stock – Large")).toHaveCount(0);
  await expectNoA11yViolations(owner);
});

test("the product is live on the storefront with its variants", async ({ page }) => {
  await expectStorefront(page, "/en/products/test-beans", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Test Beans" })).toBeVisible();
  });
  const size = page.getByRole("group", { name: "Size" });
  await expect(size.getByRole("radio", { name: "Large" })).toBeChecked();
  await expect(page.getByText("TB-L")).toBeVisible();
  await expect(page.locator("main")).toContainText("80.00");
  await expect(page.locator("main")).toContainText("95.00");
  // Small has no stock recorded yet: sold out, but still selectable.
  await size.getByText("Small").click();
  await expect(page.getByText("Sold out").first()).toBeVisible();
  await page.goto(`${storefront}/en/shop/house-coffee`);
  await expect(page.getByRole("link", { name: "Test Beans" })).toBeVisible();
});

test("inventory adjustments are recorded and reflected in the store", async ({ page }) => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await owner.getByRole("row").filter({ hasText: "Small" }).getByRole("link", { name: "Test Beans" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Test Beans" })).toBeVisible();
  await owner.getByLabel("Quantity").fill("3");
  await owner.getByLabel("Reason").selectOption("restock");
  await owner.getByLabel("Note (optional)").fill("Invoice 42");
  await owner.getByRole("button", { name: "Record change" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Stock updated." })).toBeVisible();
  await expect(owner.getByRole("cell", { name: "+3" })).toBeVisible();
  await expect(owner.getByText("Invoice 42")).toBeVisible();

  await owner.getByLabel("Change", { exact: true }).selectOption("remove");
  await owner.getByLabel("Quantity").fill("10");
  await owner.getByLabel("Reason").selectOption("damage");
  await owner.getByRole("button", { name: "Record change" }).click();
  await expect(owner.getByRole("alert").filter({ hasText: "below zero" })).toBeVisible();
  await expectNoA11yViolations(owner);

  await page.goto(`${storefront}/en/products/test-beans`);
  await page.getByRole("group", { name: "Size" }).getByText("Small").click();
  await expect(page.getByText("In stock", { exact: true })).toBeVisible();
});

test("the homepage can feature products and categories", async ({ page }) => {
  test.setTimeout(120_000);
  await owner.goto(`${CONSOLE}/en/t/${slug}/appearance/homepage`);
  for (const [type, name] of [
    ["featured_products", "Featured products"],
    ["featured_categories", "Featured categories"],
  ] as const) {
    await owner.getByLabel("Section").selectOption(type);
    await owner.getByRole("button", { name: "Add section" }).click();
    await owner.getByRole("button", { name: `Show ${name}` }).click();
    await expect(owner.getByRole("button", { name: `Hide ${name}` })).toBeVisible();
  }
  // Best sellers needs real sales data, so it is not offered yet.
  await expect(owner.getByLabel("Section").locator('option[value="best_sellers"]')).toHaveCount(0);

  await expectStorefront(page, "/en", async () => {
    await expect(page.getByRole("heading", { name: "Featured products" })).toBeVisible();
  });
  await expect(page.getByRole("link", { name: "Test Beans" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shop by category" })).toBeVisible();
  await expect(page.getByRole("link", { name: /House coffee/ })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("dashboard shows live catalog figures", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}`);
  await expect(owner.getByText("Products on sale")).toBeVisible();
  await expect(owner.getByText("Low-stock items")).toBeVisible();
});

test("owner deletes the product", async () => {
  await owner.goto(productUrl);
  await owner.getByRole("button", { name: "Delete product" }).click();
  await owner.getByRole("button", { name: "Yes, delete" }).click();
  await owner.waitForURL(`${CONSOLE}/en/t/${slug}/products`);
  await expect(owner.getByText("No products yet")).toBeVisible();
});

test("staff can view but not change the catalog", async ({ page }) => {
  await signIn(page, USERS.staffA);
  await page.goto(`${CONSOLE}/en/t/roasters/products`);
  await expect(page.getByRole("link", { name: "Ethiopia Yirgacheffe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New product" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ethiopia Yirgacheffe" }).click();
  await expect(page.getByRole("button", { name: "Save pricing & options" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete product" })).toHaveCount(0);
  await page.goto(`${CONSOLE}/en/t/roasters/inventory`);
  await page.getByRole("link", { name: "Ethiopia Yirgacheffe" }).first().click();
  await expect(page.getByRole("button", { name: "Record change" })).toHaveCount(0);
});
