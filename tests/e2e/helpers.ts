import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

export const STORE_A = "http://roasters.localhost:3000";
export const STORE_B = "http://coffeehouse.localhost:3000";
export const CONSOLE = "http://app.localhost:3000";

export const USERS = {
  ownerA: { email: "owner@roasters.test", password: "Roasters-Owner-2026" },
  staffA: { email: "staff@roasters.test", password: "Roasters-Staff-2026" },
  ownerB: { email: "owner@coffeehouse.test", password: "Coffee-Owner-2026" },
  platform: { email: "admin@smartmanager.test", password: "Platform-Admin-2026" },
} as const;

export async function signIn(page: Page, user: { email: string; password: string }, locale = "en") {
  await page.goto(`${CONSOLE}/${locale}/login`);
  await page.getByLabel(/email|e-mail|البريد/i).fill(user.email);
  await page.getByLabel(/password|mot de passe|كلمة المرور/i).fill(user.password);
  await page.getByRole("button", { name: /sign in|se connecter|تسجيل الدخول/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

/** Fails on any WCAG 2.1 A/AA violation detected by axe. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(
    results.violations.map(
      (v) =>
        `${v.id}: ${v.help} → ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary?.split("\n").pop() ?? ""}`).join(" | ")}`,
    ),
  ).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Creates a brand-new active business through the real UI (platform admin →
 * owner invitation → sign-up → activation) and returns the owner's page.
 */
export async function createActiveTenant(browser: Browser, slug: string, plan = "professional") {
  const password = "E2e-Password-2026";
  const ownerEmail = `owner-${slug}@e2e.test`;
  const admin = await (await browser.newContext({ locale: "en-US" })).newPage();
  await signIn(admin, USERS.platform);
  await admin.goto(`${CONSOLE}/en/platform/tenants/new`);
  await admin.getByLabel("Business name").fill(`Store ${slug}`);
  await admin.getByLabel("Store address").fill(slug);
  await admin.getByLabel("Plan").selectOption(plan);
  await admin.getByLabel("Default language").selectOption("en");
  await admin.getByLabel("Owner’s email").fill(ownerEmail);
  await admin.getByRole("button", { name: "Create business" }).click();
  const invite = await admin.getByLabel("Owner invitation link").inputValue();
  await admin.getByRole("link", { name: "Open business" }).click();
  await admin.locator("#tenant-status").selectOption("active");
  await admin.getByRole("button", { name: "Update" }).first().click();
  await expect(admin.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();
  await admin.context().close();

  const owner = await (await browser.newContext({ locale: "en-US" })).newPage();
  await owner.goto(invite);
  await owner.getByLabel("Full name").fill("Owner");
  await owner.getByLabel("Password", { exact: true }).fill(password);
  await owner.getByLabel("Confirm password").fill(password);
  await owner.getByRole("button", { name: "Create account and join" }).click();
  await owner.waitForURL(`${CONSOLE}/en/t/${slug}`);
  return { owner, storefront: `http://${slug}.localhost:3000` };
}
