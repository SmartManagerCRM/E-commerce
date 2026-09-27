import { expect, test } from "@playwright/test";

import { CONSOLE, USERS, signIn } from "./helpers";

/**
 * AI Operating System, Phase 1 (foundation): entitlements, tenant settings
 * and usage metering. There is no assistant to talk to yet (that's Phase 2
 * and its own approval checkpoint) — this checks the settings page reads
 * and writes tenant_settings.ai correctly and stays permission-gated.
 * Tenant isolation and RLS are already covered by pgTAP
 * (012_ai_foundation.test.sql).
 */
test("owner configures the AI assistant's identity and tone", async ({ page }) => {
  await signIn(page, USERS.ownerA);
  await page.goto(`${CONSOLE}/en/t/roasters/settings/ai`);
  await expect(page.getByRole("heading", { level: 1, name: "AI assistant" })).toBeVisible();

  await page.getByLabel("Turn on the AI assistant").check();
  await page.getByLabel("Assistant name").fill("Riya");
  await page.getByLabel("Tone").selectOption("premium");
  await page.getByLabel("Greeting (optional)").fill("Welcome to Roasters Café!");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Turn on the AI assistant")).toBeChecked();
  await expect(page.getByLabel("Assistant name")).toHaveValue("Riya");
  await expect(page.getByLabel("Tone")).toHaveValue("premium");
  await expect(page.getByLabel("Greeting (optional)")).toHaveValue("Welcome to Roasters Café!");

  // No live provider key in this environment — usage starts at zero, and the
  // page says plainly that AI isn't connected yet rather than pretending it works.
  await expect(page.getByText("AI isn't connected yet on this server.")).toBeVisible();
  await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
});

test("staff without settings.write cannot reach AI settings", async ({ page }) => {
  await signIn(page, USERS.staffA);
  await page.goto(`${CONSOLE}/en/t/roasters/settings/ai`);
  await expect(page.getByRole("alert").filter({ hasText: "You don’t have access" })).toBeVisible();
});
