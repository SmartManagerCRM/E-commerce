import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { CONSOLE, USERS, expectNoA11yViolations, signIn } from "./helpers";

/**
 * Phase 2 lifecycle on a brand-new tenant (so seeded tenants used by other
 * tests are never modified): platform admin creates a business → owner
 * accepts the invitation by creating an account → configures settings,
 * appearance and staff → platform admin activates → storefront reflects it.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const slug = `e2e-${run}`;
const ownerEmail = `owner-${run}@e2e.test`;
const staffEmail = `staff-${run}@e2e.test`;
const password = "E2e-Password-2026";
const storefront = `http://${slug}.localhost:3000`;

let ownerInvite = "";
let staffInvite = "";

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "en-US" });
  return context.newPage();
}

async function acceptBySignup(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account and join" }).click();
  await page.waitForURL(`${CONSOLE}/en/t/${slug}`);
}

test("platform admin creates a business with an owner invitation", async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, USERS.platform);
  await page.goto(`${CONSOLE}/en/platform/tenants/new`);
  await expectNoA11yViolations(page);

  await page.getByLabel("Business name").fill(`E2E Café ${run}`);
  await page.getByLabel("Store address").fill(slug);
  await page.getByLabel("Plan").selectOption("business");
  await page.getByLabel("Default language").selectOption("en");
  await page.getByLabel("Owner’s email").fill(ownerEmail);
  await page.getByRole("button", { name: "Create business" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Business created." })).toBeVisible();
  ownerInvite = await page.getByLabel("Owner invitation link").inputValue();
  expect(ownerInvite).toMatch(new RegExp(`^${CONSOLE}/en/invite/[0-9a-f]{64}$`));
});

test("a new business is not public until activated", async ({ page }) => {
  await page.goto(`${storefront}/en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Opening soon");
});

test("invitations are bound to the invited email", async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, USERS.ownerA);
  await page.goto(ownerInvite);
  await expect(page.getByRole("alert").filter({ hasText: ownerEmail })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
});

test("owner joins through the invitation and configures the business", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto(ownerInvite);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Join E2E Café ${run}`);
  await expectNoA11yViolations(page);

  // Weak passwords are rejected server-side.
  await page.getByLabel("Full name").fill("E2E Owner");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("short");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least 10 characters" })).toBeVisible();

  await acceptBySignup(page, ownerInvite, "E2E Owner");
  await expect(page.getByRole("status").filter({ hasText: "being set up" })).toBeVisible();

  // The invitation cannot be reused.
  await page.goto(ownerInvite);
  await expect(page.getByText("Invitation already used")).toBeVisible();

  // Settings
  await page.goto(`${CONSOLE}/en/t/${slug}/settings`);
  await page.getByRole("group", { name: "Tagline" }).getByLabel("English").fill("Small-batch coffee, big heart.");
  await page.getByRole("group", { name: "Tagline" }).getByLabel("العربية").fill("قهوة بكميات صغيرة وقلب كبير.");
  await page.getByLabel("Phone").fill("+966 12 345 6789");
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await expectNoA11yViolations(page);

  // Appearance
  await page.goto(`${CONSOLE}/en/t/${slug}/appearance`);
  await page.getByText("Luxury", { exact: true }).click();
  await page.locator("#primary-text").fill("#1D4E89");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  // Logo upload (generated PNG) and a rejected non-image
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: "#1D4E89" } })
    .png()
    .toBuffer();
  await page.locator("#logo-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Upload" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Image uploaded." })).toBeVisible();
  await expect(page.getByRole("img", { name: "Current logo" })).toBeVisible();

  await page
    .locator("#favicon-file")
    .setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await page.getByRole("button", { name: "Upload" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "PNG, JPEG or WebP" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("owner invites staff; staff get only their role's access", async ({ browser }) => {
  const owner = await newPage(browser);
  await signIn(owner, { email: ownerEmail, password });
  await owner.goto(`${CONSOLE}/en/t/${slug}/staff`);
  await expect(owner.getByText("of 10 staff seats used")).toBeVisible();
  await owner.getByLabel("Email").fill(staffEmail);
  await owner.getByLabel("Role", { exact: true }).selectOption("staff");
  await owner.getByRole("button", { name: "Create invitation" }).click();
  staffInvite = await owner.getByLabel("Invitation link").inputValue();
  await expect(owner.getByText(staffEmail)).toBeVisible();
  await expectNoA11yViolations(owner);

  const staff = await newPage(browser);
  await acceptBySignup(staff, staffInvite, "E2E Staff");
  const nav = staff.getByRole("navigation", { name: "Main" }).last();
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await staff.goto(`${CONSOLE}/en/t/${slug}/staff`);
  await expect(staff.getByRole("alert").filter({ hasText: "You don’t have access" })).toBeVisible();

  // Owner sees the new member and can disable them.
  await owner.reload();
  const row = owner.getByRole("row").filter({ hasText: staffEmail });
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(owner.getByRole("row").filter({ hasText: staffEmail })).toContainText("Disabled");

  // Disabled staff lose access.
  const response = await staff.goto(`${CONSOLE}/en/t/${slug}`);
  expect(response?.status()).toBe(404);
});

test("custom domains require DNS verification", async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, { email: ownerEmail, password });
  await page.goto(`${CONSOLE}/en/t/${slug}/settings`);
  await page.getByLabel("Add a domain").fill(`https://shop-${run}.example.com/`);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(`shop-${run}.example.com`, { exact: true })).toBeVisible();
  await expect(page.getByText(`_smartmanager-verify.shop-${run}.example.com`)).toBeVisible();

  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /TXT record|DNS lookup failed/ })).toBeVisible();
  await expect(page.getByText("Awaiting verification")).toBeVisible();

  // Platform domains cannot be claimed.
  await page.getByLabel("Add a domain").fill("roasters.localhost");
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /SmartManager platform|valid domain/ })).toBeVisible();
});

test("the new owner cannot reach other businesses", async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, { email: ownerEmail, password });
  expect((await page.goto(`${CONSOLE}/en/t/roasters/settings`))?.status()).toBe(404);
  expect((await page.goto(`${CONSOLE}/en/platform`))?.status()).toBe(404);
  expect((await page.goto(`${CONSOLE}/en/platform/tenants/new`))?.status()).toBe(404);
});

test("platform admin activates the business and the storefront reflects its settings", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await newPage(browser);
  await signIn(admin, USERS.platform);
  await admin.goto(`${CONSOLE}/en/platform`);
  await admin.getByRole("link", { name: `E2E Café ${run}` }).click();
  await admin.getByLabel("Status", { exact: true }).selectOption("active");
  await admin.getByRole("button", { name: "Update" }).first().click();
  await expect(admin.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();
  await expectNoA11yViolations(admin);

  const page = await newPage(browser);
  // Tenant resolution is cached for up to 60 s in the proxy; poll until live.
  await expect(async () => {
    await page.goto(`${storefront}/en`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Welcome to E2E Café ${run}`, { timeout: 1000 });
  }).toPass({ timeout: 75_000, intervals: [2_000, 5_000] });

  await expect(page.getByText("Small-batch coffee, big heart.")).toBeVisible();
  // Decorative inside the named home link, so it has empty alt text.
  const logo = page.locator("header img");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute(
    "src",
    /\/storage\/v1\/object\/public\/tenant-public\/[0-9a-f-]{36}\/branding\/logo-/,
  );
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--sm-color-primary").trim(),
  );
  expect(primary).toBe("#1D4E89");

  await page.goto(`${storefront}/ar`);
  await expect(page.getByText("قهوة بكميات صغيرة وقلب كبير.")).toBeVisible();
});
