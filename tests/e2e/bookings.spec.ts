import { expect, test, type Page } from "@playwright/test";

import { CONSOLE, createActiveTenant } from "./helpers";

/**
 * Phase 8: booking requests and the staff confirm/reject workflow, on a
 * fresh tenant (booking is a professional-plan feature) so the seeded
 * tenants used by other specs stay untouched. The database's own exclusion
 * constraint and transition table are already covered by pgTAP
 * (010_bookings.test.sql); this checks the UI wiring end to end.
 */
test.describe.configure({ mode: "serial" });

const slug = `booking-${Date.now().toString(36)}`;
let owner: Page;
let storefront = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));

  // Open every day 09:00–22:00 so slot generation never depends on which
  // weekday the suite happens to run on.
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings`);
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
    await owner.getByLabel(`${day} status`).selectOption("open");
  }
  await owner.getByRole("button", { name: "Save changes" }).nth(1).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();

  // Turn bookings on and add one bookable table.
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings/booking`);
  await owner.getByLabel("Accepting booking requests").check();
  await owner.getByRole("button", { name: "Save changes" }).first().click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();

  await owner.getByRole("group", { name: "Name" }).getByLabel("English").fill("Main table");
  await owner.getByLabel("Maximum guests").fill("6");
  await owner.getByRole("button", { name: "Add resource" }).click();
  await expect(owner.getByRole("status").filter({ hasText: "Booking resource added." })).toBeVisible();
});

test("guest requests a booking and can track and cancel it", async ({ page }) => {
  await page.goto(`${storefront}/en/booking`);
  await expect(page.getByRole("heading", { name: "Book a table" })).toBeVisible();

  await page.getByLabel("Party size").fill("2");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(tomorrow);

  const slotButton = page.locator("button[aria-pressed]").first();
  await expect(slotButton).toBeVisible({ timeout: 10_000 });
  await slotButton.click();

  await page.getByLabel("Full name").fill("Ada Guest");
  await page.getByLabel("Email").fill("ada-guest@example.com");
  await page.getByRole("button", { name: "Request booking" }).click();

  await page.waitForURL(/\/bookings\//, { timeout: 15_000 });
  await expect(page.getByText("Thanks — your booking request is in!")).toBeVisible();
  await expect(page.getByText("Pending confirmation")).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("This booking has been cancelled.")).toBeVisible({ timeout: 10_000 });
});

test("staff sees the request and can confirm it", async ({ page }) => {
  await page.goto(`${storefront}/en/booking`);
  await page.getByLabel("Party size").fill("3");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').fill(tomorrow);
  const slotButton = page.locator("button[aria-pressed]").nth(1);
  await expect(slotButton).toBeVisible({ timeout: 10_000 });
  await slotButton.click();
  await page.getByLabel("Full name").fill("Staff-Confirmed Guest");
  await page.getByLabel("Email").fill("staff-confirmed@example.com");
  await page.getByRole("button", { name: "Request booking" }).click();
  await page.waitForURL(/\/bookings\//, { timeout: 15_000 });

  await owner.goto(`${CONSOLE}/en/t/${slug}/bookings`);
  await expect(owner.getByText("Staff-Confirmed Guest")).toBeVisible({ timeout: 10_000 });
  await owner.getByText("Staff-Confirmed Guest").click();
  await owner.waitForURL(/\/bookings\//);
  await owner.getByRole("button", { name: "Confirm" }).click();
  await expect(owner.getByText("Confirmed", { exact: true })).toBeVisible({ timeout: 10_000 });
});
