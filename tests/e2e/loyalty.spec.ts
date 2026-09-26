import { expect, test, type Page } from "@playwright/test";

import { CONSOLE, createActiveTenant } from "./helpers";

/**
 * Phase 9: loyalty program settings, automatic point accrual on a paid
 * order, and the staff redeem/adjust workflow, on a fresh tenant (loyalty is
 * a business/professional-plan feature). The database's own accrual
 * idempotency and tier/redemption logic are already covered by pgTAP
 * (011_loyalty.test.sql); this checks the UI wiring end to end.
 */
test.describe.configure({ mode: "serial" });

const slug = `loyalty-${Date.now().toString(36)}`;
let owner: Page;
let storefront = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));

  await owner.goto(`${CONSOLE}/en/t/${slug}/products/new`);
  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Loyalty Mug");
  await owner.getByLabel("Price (SAR)").fill("50");
  await owner.getByRole("button", { name: "Create product" }).click();
  await owner.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const details = owner.locator("form").filter({ has: owner.getByLabel("Status") });
  await details.getByLabel("Status").selectOption("active");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(details.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/inventory`);
  await owner.getByRole("link", { name: "Loyalty Mug" }).click();
  await owner.getByLabel("Quantity").fill("10");
  await owner.getByLabel("Reason").selectOption("restock");
  await owner.getByRole("button", { name: "Record change" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Stock updated." })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/checkout`);
  await owner.getByLabel("Accept online orders").check();
  await owner.getByRole("group", { name: "Fulfillment" }).getByLabel("Pickup in store").check();
  await owner.getByLabel("Pay on pickup or delivery").check();
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/loyalty`);
  await owner.getByLabel("Award points on paid orders").check();
  await owner.getByLabel(/Points per .+ spent/).fill("1");
  await owner.getByRole("button", { name: "Save changes" }).first().click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();

  const rewardsSection = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Rewards" }) });
  await rewardsSection.getByRole("group", { name: "Name" }).getByLabel("English").fill("5 SAR off");
  await rewardsSection.getByLabel("Cost (points)").fill("20");
  await rewardsSection.getByLabel("Value").fill("5");
  await rewardsSection.getByRole("button", { name: "Add reward" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Reward added." })).toBeVisible();
});

test("a paid order earns points, and staff can redeem a reward and adjust the balance", async ({ page }) => {
  await page.goto(`${storefront}/en/products/loyalty-mug`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to your cart.", { exact: true })).toBeVisible();

  await page.goto(`${storefront}/en/checkout`);
  await page.getByLabel("Full name").fill("Points Customer");
  await page.getByRole("textbox", { name: "Email" }).fill("points-customer@example.com");
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/en\/orders\/\d+\?t=/);
  await expect(page.getByText("Thank you — your order is in!")).toBeVisible();
  const orderNumber = (await page.locator("h1").textContent())!.replace(/\D+/g, "");

  await owner.goto(`${CONSOLE}/en/t/${slug}/orders`);
  await owner.getByRole("link", { name: `#${orderNumber}` }).click();
  await owner.getByLabel("Payment method").selectOption("cash");
  await owner.getByRole("button", { name: "Mark as paid" }).click();
  await expect(owner.getByText("Paid by cash on")).toBeVisible();

  await owner.goto(`${CONSOLE}/en/t/${slug}/customers`);
  await owner.getByText("Points Customer").click();
  await expect(owner.getByRole("heading", { name: "Loyalty" })).toBeVisible();
  const loyaltySection = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Loyalty" }) });
  await expect(loyaltySection.getByText("50", { exact: true }).first()).toBeVisible();

  await owner.getByLabel("Reward").selectOption({ label: "5 SAR off — 20" });
  await owner.getByRole("button", { name: "Redeem" }).click();
  await expect(owner.getByText(/Redeemed .*5 SAR off.* — apply it/)).toBeVisible();
  await expect(loyaltySection.getByText("30", { exact: true })).toBeVisible();

  await owner.getByLabel("Points (use a negative number to deduct)").fill("10");
  await owner.getByRole("button", { name: "Apply adjustment" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Points adjusted." })).toBeVisible();
  await expect(loyaltySection.getByText("40", { exact: true })).toBeVisible();
});
