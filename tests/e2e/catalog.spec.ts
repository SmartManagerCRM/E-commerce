import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, expectNoHorizontalOverflow, STORE_A, STORE_B } from "./helpers";

/**
 * Phase 4 storefront: shop listing, filters, category pages and product
 * pages against the seeded catalog (read-only).
 */
test.describe("shop", () => {
  test("lists active products with prices and hides drafts", async ({ page }) => {
    await page.goto(`${STORE_A}/en/shop`);
    await expect(page.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ethiopia Yirgacheffe" })).toBeVisible();
    await expect(page.getByRole("link", { name: "V60 dripper" })).toBeVisible();
    await expect(page.getByRole("link", { name: "House espresso blend" })).toHaveCount(0);
    // Variant price range and sale price.
    await expect(page.getByRole("article").filter({ hasText: "Ethiopia Yirgacheffe" })).toContainText("From");
    await expect(page.getByRole("article").filter({ hasText: "V60 dripper" }).locator("s")).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "Colombia Huila" })).toContainText("Sold out");
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
  });

  test("filters by search, availability and category", async ({ page }) => {
    await page.goto(`${STORE_A}/en/shop?q=eth-yir`);
    await expect(page.getByRole("status").filter({ hasText: "1 product" })).toBeVisible();
    await page.goto(`${STORE_A}/en/shop?available=1`);
    await expect(page.getByRole("link", { name: "Colombia Huila" })).toHaveCount(0);
    await page.goto(`${STORE_A}/en/shop`);
    await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Brewing gear" }).click();
    await expect(page).toHaveURL(/\/en\/shop\/brewing-gear$/);
    await expect(page.getByRole("heading", { level: 1, name: "Brewing gear" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ethiopia Yirgacheffe" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "V60 dripper" })).toBeVisible();
    await page.goto(`${STORE_A}/en/shop/no-such-category`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  });

  test("sorting keeps the URL shareable", async ({ page }) => {
    await page.goto(`${STORE_A}/en/shop`);
    await page.getByLabel("Sort by").selectOption("price_desc");
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page.getByRole("article").first()).toContainText("Ethiopia Yirgacheffe");
  });

  test("header links to the shop", async ({ page, isMobile }) => {
    await page.goto(`${STORE_A}/en`);
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = isMobile ? page.getByRole("dialog") : page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/en\/shop$/);
  });
});

test.describe("product page", () => {
  test("choosing an option updates price, stock and SKU", async ({ page }) => {
    await page.goto(`${STORE_A}/en/products/ethiopia-yirgacheffe`);
    await expect(page.getByRole("heading", { level: 1, name: "Ethiopia Yirgacheffe" })).toBeVisible();
    const size = page.getByRole("group", { name: "Size" });
    await expect(size.getByRole("radio", { name: "250 g" })).toBeChecked();
    await expect(page.getByText("ETH-YIR-250")).toBeVisible();
    await expect(page.getByText("In stock", { exact: true })).toBeVisible();
    await size.getByText("1 kg").click();
    await expect(page.getByText("ETH-YIR-1KG")).toBeVisible();
    await expect(page.getByText("Only a few left")).toBeVisible();
    await expect(page.locator("main")).toContainText("220.00");
    // Roasters takes online orders (Phase 5): the panel offers the real thing, not a placeholder.
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
  });

  test("a store with ordering off shows an honest message instead of a cart button", async ({ page }) => {
    // Coffeehouse (Tenant B) has not turned on online ordering.
    await page.goto(`${STORE_B}/en/products/tasse-ceramique`);
    await expect(page.getByText("Online ordering opens soon")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  });

  test("structured data describes the product and its offers", async ({ page }) => {
    await page.goto(`${STORE_A}/en/products/ethiopia-yirgacheffe`);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = blocks.flatMap((b) => [JSON.parse(b)].flat()).find((d) => d["@type"] === "Product");
    expect(product.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "65.00",
      highPrice: "220.00",
      priceCurrency: "SAR",
    });
  });

  test("renders right-to-left in Arabic with related products", async ({ page }) => {
    await page.goto(`${STORE_A}/ar/products/colombia-huila`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "كولومبيا هويلا" })).toBeVisible();
    await expect(page.getByText("نفدت الكمية").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "قد يعجبك أيضًا" })).toBeVisible();
    await expect(page.getByRole("link", { name: "إثيوبيا يرغاتشيفي" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
  });

  test("drafts and other stores' products are not found", async ({ page }) => {
    for (const url of [`${STORE_A}/en/products/house-espresso`, `${STORE_B}/en/products/v60-dripper`]) {
      const response = await page.goto(url);
      expect(response?.status()).toBe(404);
    }
  });
});

test("sitemap lists catalog pages", async ({ page }) => {
  // Fetched through the browser, which resolves *.localhost hosts.
  const xml = await (await page.goto(`${STORE_A}/sitemap.xml`))!.text();
  expect(xml).toContain("/en/shop/coffee-beans</loc>");
  expect(xml).toContain("/ar/products/ethiopia-yirgacheffe</loc>");
  expect(xml).not.toContain("house-espresso");
});
