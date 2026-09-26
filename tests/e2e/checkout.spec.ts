import { expect, test, type Page } from "@playwright/test";

import {
  CONSOLE,
  createActiveTenant,
  expectNoA11yViolations,
  expectNoHorizontalOverflow,
  USERS,
  signIn,
} from "./helpers";

/**
 * Phase 5: cart, checkout and order lifecycle, on a fresh tenant so the
 * seeded tenants (used by other specs) stay untouched. Covers both sides —
 * the storefront customer flow and the console order workflow — because
 * they only make sense checked together (an order placed here must show up
 * there, exactly as priced by the database).
 */
test.describe.configure({ mode: "serial" });

const slug = `checkout-${Date.now().toString(36)}`;
let owner: Page;
let customer: Page;
let storefront = "";
let orderNumber = "";
let orderUrl = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));
  // One customer page/context for the whole cart → checkout flow: the cart
  // cookie must persist across those steps, unlike Playwright's usual
  // fresh-page-per-test.
  customer = await (await browser.newContext({ locale: "en-US" })).newPage();

  // Give the store a purchasable product with real stock.
  await owner.goto(`${CONSOLE}/en/t/${slug}/products/new`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Espresso Beans");
  await owner.getByLabel("Price (SAR)").fill("40");
  await owner.getByRole("button", { name: "Create product" }).click();
  await owner.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const details = owner.locator("form").filter({ has: owner.getByLabel("Status") });
  await details.getByLabel("Status").selectOption("active");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(details.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  // The default variant already exists (created with the product), so stock
  // is added the normal way: an inventory adjustment, not an "opening stock"
  // field (that only applies to a brand-new variant not yet saved).
  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await owner.getByRole("link", { name: "Espresso Beans" }).click();
  await owner.getByLabel("Quantity").fill("10");
  await owner.getByLabel("Reason").selectOption("restock");
  await owner.getByRole("button", { name: "Record change" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Stock updated." })).toBeVisible();

  // A second, sold-out product to check the cart rejects it.
  await owner.goto(`${CONSOLE}/en/t/${slug}/products/new`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Sold Out Mug");
  await owner.getByLabel("Price (SAR)").fill("25");
  await owner.getByRole("button", { name: "Create product" }).click();
  await owner.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const mugDetails = owner.locator("form").filter({ has: owner.getByLabel("Status") });
  await mugDetails.getByLabel("Status").selectOption("active");
  await mugDetails.getByRole("button", { name: "Save changes" }).click();
  await expect(mugDetails.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
});

test("checkout is closed until the owner turns on ordering", async ({ page }) => {
  await page.goto(`${storefront}/en/products/espresso-beans`);
  await expect(page.getByText("Online ordering opens soon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
});

test("owner enables pickup, delivery and VAT", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/checkout`);
  await expect(owner.getByText("needs the server’s Supabase secret key")).toHaveCount(0);
  await owner.getByLabel("Accept online orders").check();
  const fulfillment = owner.getByRole("group", { name: "Fulfillment" });
  await fulfillment.getByLabel("Pickup in store").check();
  await fulfillment.getByLabel("Delivery").check();
  await owner.getByLabel("Pay on pickup or delivery").check();
  await owner.getByLabel("VAT rate (%)").fill("15");
  await owner.getByLabel("My prices include VAT").uncheck();
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await owner.getByRole("group", { name: "Area name" }).getByLabel("English").fill("City centre");
  await owner.getByLabel("Fee (SAR)").fill("10");
  await owner.getByLabel("Minimum (SAR)").fill("30");
  await owner.getByRole("button", { name: "Add area" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "area added" })).toBeVisible();
  await expectNoA11yViolations(owner);
});

test("an out-of-stock product cannot be added to the cart", async ({ page }) => {
  await page.goto(`${storefront}/en/products/sold-out-mug`);
  await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();
});

test("a customer adds to cart, adjusts quantity and sees a live total", async () => {
  await customer.goto(`${storefront}/en/products/espresso-beans`);
  await expect(customer.getByRole("heading", { level: 1, name: "Espresso Beans" })).toBeVisible();
  await customer.getByRole("button", { name: "Add to cart" }).click();
  await expect(customer.getByText("Added to your cart.", { exact: true })).toBeVisible();
  await expect(customer.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();

  await customer.goto(`${storefront}/en/cart`);
  await expect(customer.getByText("Espresso Beans")).toBeVisible();
  await expect(customer.locator("main")).toContainText("40.00");
  await customer.getByRole("button", { name: "One more Espresso Beans" }).click();
  await expect(customer.getByText("Subtotal (2 items)")).toBeVisible();
  await expect(customer.locator("main")).toContainText("80.00");
  await expectNoHorizontalOverflow(customer);
  await expectNoA11yViolations(customer);
});

test("checkout quotes VAT on top and lets the customer choose delivery", async () => {
  const page = customer;
  await page.goto(`${storefront}/en/checkout`);
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
  // Pickup: 80.00 + 15% VAT = 92.00.
  await expect(page.getByRole("button", { name: /Place order/ })).toContainText("92.00");

  await page.getByRole("radio", { name: "Delivery" }).check();
  await expect(page.getByLabel("Delivery area")).toContainText("City centre");
  // 80.00 + 10.00 delivery = 90.00; +15% VAT = 103.50.
  await expect(page.getByRole("button", { name: /Place order/ })).toContainText("103.50");
  // Delivery requires a phone number; the field enforces it before the form can submit.
  expect(await page.getByLabel("Phone").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

  await page.getByLabel("Full name").fill("Sara Ahmed");
  await page.getByRole("textbox", { name: "Email" }).fill("sara@example.com");
  await page.getByLabel("Phone").fill("+966500000000");
  await page.getByLabel("Street and building").fill("King Fahd Road 12");
  await page.getByLabel("District / city").fill("Riyadh");
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: /Place order/ }).click();

  await page.waitForURL(/\/en\/orders\/\d+\?t=/);
  await expect(page.getByText("Thank you — your order is in!")).toBeVisible();
  await expect(page.locator("main")).toContainText("103.50");
  orderUrl = page.url();
  orderNumber = (await page.locator("h1").textContent())!.replace(/\D+/g, "");
  expect(orderNumber).toMatch(/^\d+$/);
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);

  // The cart is now empty and its cookie cleared.
  await page.goto(`${storefront}/en/cart`);
  await expect(page.getByText("Your cart is empty")).toBeVisible();
});

test("the order link requires the right token", async ({ page }) => {
  const wrongToken = "wrong-token-that-is-not-the-real-one-at-all-000000";
  const response = await page.goto(`${storefront}/en/orders/${orderNumber}?t=${wrongToken}`);
  expect(response?.status()).toBe(404);
});

test("owner sees the order, confirms it and marks it paid", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/orders`);
  await expect(owner.getByText("Sara Ahmed")).toBeVisible();
  await owner.getByRole("link", { name: `#${orderNumber}` }).click();
  await expect(owner.getByRole("heading", { level: 1, name: `Order #${orderNumber}` })).toBeVisible();
  await expect(owner.locator("main")).toContainText("103.50");
  await expect(owner.getByText("King Fahd Road 12")).toBeVisible();
  await expect(owner.getByText("sara@example.com")).toBeVisible();

  await owner.getByRole("button", { name: "Confirm order" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Order updated." })).toBeVisible();
  await owner.getByRole("button", { name: "Out for delivery" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Order updated." })).toBeVisible();

  await owner.getByLabel("Payment method").selectOption("cash");
  await owner.getByRole("button", { name: "Mark as paid" }).click();
  // The payment form is replaced by the "Paid by …" line once recorded — that's the confirmation.
  await expect(owner.getByText("Paid by cash on")).toBeVisible();

  await owner.getByRole("button", { name: "Mark completed" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Order updated." })).toBeVisible();
  // Scoped to the heading's row: the order history list further down also says "Completed".
  const header = owner.getByRole("heading", { level: 1, name: `Order #${orderNumber}` }).locator("..");
  await expect(header.getByText("Completed", { exact: true })).toBeVisible();
  await expectNoA11yViolations(owner);
});

test("completing the order deducts stock and the customer's progress page reflects it", async ({ page }) => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await expect(owner.getByRole("row").filter({ hasText: "Espresso Beans" })).toContainText("8");

  await page.goto(orderUrl);
  await expect(page.locator('[aria-current="step"]')).toHaveText("Completed");
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
});

test("the customer appears in Customers with their order history", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/customers`);
  await expect(owner.getByText("Sara Ahmed")).toBeVisible();
  await owner.getByRole("link", { name: "Sara Ahmed" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Sara Ahmed" })).toBeVisible();
  await expect(owner.locator("main")).toContainText("103.50");
  await owner.getByRole("link", { name: `#${orderNumber}` }).click();
  await expect(owner.getByRole("heading", { level: 1, name: `Order #${orderNumber}` })).toBeVisible();
});

test("an unrelated staff member cannot see this tenant's orders", async ({ page }) => {
  // only checks the permission gate exists; a full role test lives in console.spec.ts.
  await signIn(page, USERS.staffA);
  const response = await page.goto(`${CONSOLE}/en/t/${slug}/orders`);
  expect(response?.status()).toBe(404);
});

test("turning ordering off closes checkout again, even with items already in the cart", async ({ page }) => {
  // Add to the cart while ordering is still on, so the redirect for an empty
  // cart doesn't hide the closed-checkout message we're about to check for.
  await page.goto(`${storefront}/en/products/espresso-beans`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.", { exact: true })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/checkout`);
  const orderingForm = owner.locator("form").filter({ has: owner.getByLabel("Accept online orders") });
  await orderingForm.getByLabel("Accept online orders").uncheck();
  await orderingForm.getByRole("button", { name: "Save changes" }).click();
  await expect(orderingForm.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await page.goto(`${storefront}/en/products/espresso-beans`);
  await expect(page.getByText("Online ordering opens soon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);

  await page.goto(`${storefront}/en/checkout`);
  await expect(page.getByText("Online ordering is paused")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to cart" })).toBeVisible();
});
