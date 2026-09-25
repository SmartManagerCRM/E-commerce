import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

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
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
