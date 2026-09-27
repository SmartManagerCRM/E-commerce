import { expect, test } from "@playwright/test";

import { STORE_A, STORE_B, USERS, signIn } from "./helpers";

/**
 * AI Operating System, Phase 2 (ordering assistant). The critical invariant
 * — a dine-in order can never be created without a server-validated table —
 * is proven at the database layer by pgTAP (013_ai_ordering.test.sql), which
 * exercises both the guest checkout function directly and a raw INSERT that
 * bypasses it entirely. This suite checks the layer above it: the widget
 * only appears when the tenant has actually turned the assistant on, the
 * table (`?table=`) entry point reaches the assistant rather than silently
 * doing nothing, and a turn that can't reach a model degrades to a plain
 * message instead of a broken UI — there is no live provider key in this
 * environment, the same constraint ai-foundation.spec.ts already documents.
 *
 * The first two tests share roasters' AI setting, so they run serially.
 */
test.describe.configure({ mode: "serial" });

test("the AI ordering widget appears once the owner turns it on, and degrades gracefully without a live provider", async ({ page }) => {
  await signIn(page, USERS.ownerA);

  // Turned off first, so the widget's absence and appearance are both
  // actually observed here rather than assumed from a previous test's state.
  await page.goto("http://app.localhost:3000/en/t/roasters/settings/ai");
  await page.getByLabel("Turn on the AI assistant").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await page.goto(`${STORE_A}/en`);
  await expect(page.getByRole("button", { name: "Chat with us" })).toHaveCount(0);

  await page.goto("http://app.localhost:3000/en/t/roasters/settings/ai");
  await page.getByLabel("Turn on the AI assistant").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  await page.goto(`${STORE_A}/en`);
  const launcher = page.getByRole("button", { name: "Chat with us" });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.getByPlaceholder("Type a message…");
  await input.fill("Hello");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Hello")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Something went wrong. Please try again.");
  await expect(input).toBeEnabled();
});

test("a table QR link opens the assistant and reaches it with the table context", async ({ page }) => {
  await page.goto(`${STORE_A}/en?table=Table%2012`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("I'm dining in at table Table 12.")).toBeVisible();
  // No live model in this environment, so the turn cannot complete — but it
  // reached the server (an error, not silence) and the widget stays usable.
  await expect(dialog.getByRole("alert")).toBeVisible();
});

test("a tenant on a plan without the AI ordering entitlement never sees the widget", async ({ page }) => {
  await page.goto(`${STORE_B}/en`);
  await expect(page.getByRole("button", { name: "Chat with us" })).toHaveCount(0);
});
