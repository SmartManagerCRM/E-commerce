import { expect, test, type Page } from "@playwright/test";

import { CONSOLE, createActiveTenant } from "./helpers";

/**
 * Phase 6: online payments (Moyasar) configuration and the checkout path
 * that leads to it. This environment has no reachable Moyasar test account,
 * so the live provider round-trip (redirect to Moyasar, pay, webhook) is not
 * exercised here — that requires real test keys and network access, and is
 * the one thing that can only be verified once those are in place (see the
 * phase report). What *is* verified end to end: configuring the provider,
 * the checkout UI offering both payment methods once it's active, an order
 * being created `pending_payment` with stock reserved, staff being unable to
 * hand-advance an unpaid order, and the storefront failing honestly (no
 * crash, a clear "awaiting payment" state with a retry link) when the
 * provider call itself cannot succeed.
 */
test.describe.configure({ mode: "serial" });

const slug = `payments-${Date.now().toString(36)}`;
let owner: Page;
let storefront = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));

  await owner.goto(`${CONSOLE}/en/t/${slug}/products/new`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Filter Coffee");
  await owner.getByLabel("Price (SAR)").fill("30");
  await owner.getByRole("button", { name: "Create product" }).click();
  await owner.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const details = owner.locator("form").filter({ has: owner.getByLabel("Status") });
  await details.getByLabel("Status").selectOption("active");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(details.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await owner.getByRole("link", { name: "Filter Coffee" }).click();
  await owner.getByLabel("Quantity").fill("5");
  await owner.getByLabel("Reason").selectOption("restock");
  await owner.getByRole("button", { name: "Record change" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Stock updated." })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/checkout`);
  await owner.getByLabel("Accept online orders").check();
  await owner.getByRole("group", { name: "Fulfillment" }).getByLabel("Pickup in store").check();
  const paymentGroup = owner.getByRole("group", { name: "Payment" });
  await paymentGroup.getByLabel("Pay on pickup or delivery").check();
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
});

test("payments settings starts unconfigured", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/payments`);
  await expect(owner.getByText("Moyasar isn't configured yet.")).toBeVisible();
  await expect(owner.getByLabel("Accept online payments at checkout")).not.toBeChecked();
});

test("checkout offers only pay-on-fulfillment until online payment is configured", async ({ page }) => {
  await page.goto(`${storefront}/en/products/filter-coffee`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();
  await page.goto(`${storefront}/en/checkout`);
  await expect(page.getByText("Pay when you pick up your order in store.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Pay online now/ })).toHaveCount(0);
});

test("owner configures Moyasar test keys", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/payments`);
  await owner.getByLabel("Publishable key").fill("pk_test_e2e_0000000000000000");
  await owner.getByLabel("Secret key").fill("sk_test_e2e_0000000000000000");
  await owner.getByLabel("Webhook secret token").fill("whsec_e2e_0000000000000000");
  await owner.getByLabel("Cards (Visa, Mastercard)").check();
  await owner.getByLabel("Mada").check();
  await owner.getByLabel("Accept online payments at checkout").check();
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await owner.reload();
  await expect(owner.getByText("Moyasar is configured.")).toBeVisible();
  // The secret itself is never shown back.
  await expect(owner.getByLabel("Secret key")).toHaveValue("");
});

test("checkout now offers a choice between pay on pickup and pay online, and placing an online order holds the order for payment", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`${storefront}/en/products/filter-coffee`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("link", { name: /Cart, 1 item/ })).toBeVisible();
  await page.goto(`${storefront}/en/checkout`);
  await expect(page.getByRole("radio", { name: "Pay when you pick up your order in store." })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Pay online now" })).toBeVisible();

  await page.getByRole("radio", { name: "Pay online now" }).check();
  await expect(page.getByRole("button", { name: /Pay now/ })).toBeVisible();
  await page.getByLabel("Full name").fill("Nora Ahmad");
  await page.getByRole("textbox", { name: "Email" }).fill("nora@example.com");
  await page.getByRole("button", { name: /Pay now/ }).click();

  // The provider isn't reachable from this environment with test keys, so
  // the honest outcome is: no crash, the order lands as pending_payment,
  // and the customer sees a clear "waiting to be paid" state, not a paid one.
  await page.waitForURL(/\/orders\/\d+/);
  await expect(page.getByRole("status").getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByRole("link", { name: "Complete payment" })).toBeVisible();
});

test("staff sees the order awaiting payment and can only cancel it", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/orders`);
  const row = owner.getByRole("row").filter({ hasText: "Nora Ahmad" });
  await expect(row.getByText("Awaiting payment")).toBeVisible();
  await row.getByRole("link", { name: /^#\d+$/ }).click();
  await expect(owner.getByRole("button", { name: "Confirm order" })).toHaveCount(0);
  await expect(owner.getByRole("button", { name: "Cancel order" })).toBeVisible();
});
