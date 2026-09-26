import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { CONSOLE, createActiveTenant, expectNoA11yViolations, expectNoHorizontalOverflow } from "./helpers";

/**
 * Phase 3: homepage builder, design customisation, opening hours, newsletter
 * and storefront SEO — on a fresh tenant so seeded tenants stay untouched.
 */
test.describe.configure({ mode: "serial" });

const slug = `design-${Date.now().toString(36)}`;
let owner: Page;
let storefront = "";

/** Tenant resolution may be cached for up to 60 s; poll the storefront until a change is live. */
async function expectStorefront(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(`${storefront}${path}`);
    await check();
  }).toPass({ timeout: 75_000, intervals: [1_000, 3_000, 5_000] });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  ({ owner, storefront } = await createActiveTenant(browser, slug));
});

test("a new store gets a default homepage built from its profile", async ({ page }) => {
  await page.goto(`${storefront}/en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Store ${slug}`);
  // No invented content: no testimonials, story or promotions by default.
  await expect(page.getByText("What our customers say")).toHaveCount(0);
});

test("owner builds the homepage with sections", async ({ page }) => {
  test.setTimeout(150_000);
  await owner.goto(`${CONSOLE}/en/t/${slug}/appearance/homepage`);
  await expectNoA11yViolations(owner);

  // Add and fill a promotional banner.
  await owner.getByLabel("Section").selectOption("promo_banner");
  await owner.getByRole("button", { name: "Add section" }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "Promotional banner" })).toBeVisible();
  const promo = owner.getByRole("listitem").filter({ hasText: "Promotional banner" });
  await promo.getByText("Edit Promotional banner").click();
  await promo.getByRole("group", { name: "Message" }).getByLabel("English").fill("Autumn harvest is here.");
  await promo.getByRole("group", { name: "Button text" }).getByLabel("English").fill("Visit us");
  await promo.getByLabel("Button link").fill("#visit");
  await promo.getByRole("button", { name: "Save changes" }).click();
  await expect(promo.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await promo.getByRole("button", { name: "Show Promotional banner" }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "Promotional banner" }).getByText("Shown")).toBeVisible();

  // Unsafe links are rejected.
  const promo2 = owner.getByRole("listitem").filter({ hasText: "Promotional banner" });
  await promo2.getByLabel("Button link").fill("javascript:alert(1)");
  await promo2.getByRole("button", { name: "Save changes" }).click();
  await expect(promo2.getByRole("alert")).toContainText("https://");

  // Hero: centred layout, custom title and an uploaded photo.
  const hero = owner.getByRole("listitem").filter({ hasText: "Hero" }).first();
  await hero.getByText("Edit Hero").click();
  await hero.getByLabel("Layout").selectOption("centered");
  await hero.getByRole("group", { name: "Title" }).getByLabel("English").fill("Coffee worth slowing down for");
  const photo = await sharp({ create: { width: 2400, height: 1400, channels: 3, background: "#6B3F24" } })
    .jpeg()
    .toBuffer();
  await hero.locator('input[name="image"]').setInputFiles({ name: "hero.jpg", mimeType: "image/jpeg", buffer: photo });
  await hero.getByRole("button", { name: "Save changes" }).click();
  await expect(hero.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();

  // Enable the newsletter and move it to the top of the list.
  const newsletter = owner.getByRole("listitem").filter({ hasText: "Newsletter" });
  await newsletter.getByRole("button", { name: "Show Newsletter" }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: "Newsletter" }).getByText("Shown")).toBeVisible();

  await expectStorefront(page, "/en", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coffee worth slowing down for", {
      timeout: 1000,
    });
  });
  await expect(page.getByText("Autumn harvest is here.")).toBeVisible();
  await expect(page.locator("main section").first().locator("img")).toHaveAttribute("srcset", /_next\/image/);
  await expect(page.getByRole("heading", { name: "Stay in the loop" })).toBeVisible();
});

test("design details: header, announcement and social links", async ({ page }) => {
  test.setTimeout(120_000);
  await owner.goto(`${CONSOLE}/en/t/${slug}/appearance`);
  await owner.getByLabel("Header", { exact: true }).selectOption("centered");
  await owner.getByLabel("Button style").selectOption("pill");
  await owner
    .getByRole("group", { name: "Announcement bar (optional)" })
    .getByLabel("English")
    .fill("Free pickup every day");
  // Browser validation catches non-URLs; the server rejects anything but https.
  await owner.getByLabel("Instagram").fill("not a url");
  expect(await owner.getByLabel("Instagram").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await owner.getByLabel("Instagram").fill("http://instagram.com/insecure");
  await owner.getByRole("button", { name: "Save changes" }).last().click();
  await expect(owner.getByRole("alert").filter({ hasText: "https://" })).toBeVisible();

  await owner.getByLabel("Instagram").fill("https://instagram.com/e2e-coffee");
  await owner.getByRole("button", { name: "Save changes" }).last().click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).last()).toBeVisible();

  await expectStorefront(page, "/en", async () => {
    await expect(page.getByText("Free pickup every day")).toBeVisible({ timeout: 1000 });
  });
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    "https://instagram.com/e2e-coffee",
  );
  const radius = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--sm-radius-button").trim(),
  );
  expect(radius).toBe("9999px");
});

test("opening hours appear in the location section", async ({ page }) => {
  test.setTimeout(120_000);
  await owner.goto(`${CONSOLE}/en/t/${slug}/settings`);
  await owner.getByLabel("Address", { exact: true }).fill("1 Test Street");
  await owner.getByRole("button", { name: "Save changes" }).first().click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).first()).toBeVisible();

  await owner.getByLabel("Monday status").selectOption("open");
  await owner.getByLabel("Friday status").selectOption("closed");
  await owner.getByRole("button", { name: "Save changes" }).nth(1).click();
  await expect(owner.getByRole("status").filter({ hasText: "Changes saved." }).nth(1)).toBeVisible();

  // The store was created without an address, so its homepage has no
  // location section yet: add it and show it.
  await owner.goto(`${CONSOLE}/en/t/${slug}/appearance/homepage`);
  const location = owner.getByRole("listitem").filter({ hasText: "Location & hours" });
  await owner.getByLabel("Section").selectOption("location");
  await owner.getByRole("button", { name: "Add section" }).click();
  await expect(location).toBeVisible();
  await location.getByRole("button", { name: "Show Location & hours" }).click();
  await expect(location.getByText("Shown")).toBeVisible();

  await expectStorefront(page, "/en", async () => {
    await expect(page.getByRole("table", { name: "Opening hours" })).toBeVisible({ timeout: 1000 });
  });
  await expect(page.getByRole("row", { name: /Friday/ })).toContainText("Closed");
  await expect(page.getByRole("banner").getByRole("link", { name: "Visit us" })).toBeAttached();
});

test("newsletter requires consent and stores the sign-up", async ({ page }) => {
  await page.goto(`${storefront}/en#newsletter`);
  const form = page.locator("#newsletter form");
  await form.getByLabel("Email address").fill("reader@example.com");
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByRole("alert")).toContainText("agree");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByRole("status").filter({ hasText: "you’re subscribed" })).toBeVisible();
});

test("storefront SEO: structured data, robots and sitemap are tenant-specific", async ({ page }) => {
  await page.goto(`${storefront}/en`);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld["@type"]).toBe("CafeOrCoffeeShop");
  expect(ld.name).toBe(`Store ${slug}`);

  // Fetched through the browser, which resolves *.localhost hosts.
  const robots = await (await page.goto(`${storefront}/robots.txt`))!.text();
  expect(robots).toContain(`Sitemap: http://${slug}.localhost:3000/sitemap.xml`);
  const sitemap = await (await page.goto(`${storefront}/sitemap.xml`))!.text();
  expect(sitemap).toContain(`<loc>http://${slug}.localhost:3000/en</loc>`);
  expect(sitemap).toContain('hreflang="ar"');
  const consoleRobots = await (await page.goto(`${CONSOLE}/robots.txt`))!.text();
  expect(consoleRobots).toContain("Disallow: /");
});

test("storefront with every section is accessible, RTL-correct and fits phones", async ({ browser }) => {
  for (const [locale, dir] of [
    ["en", "ltr"],
    ["ar", "rtl"],
  ] as const) {
    const page = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    ).newPage();
    await page.goto(`${storefront}/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);

    // Mobile menu drawer opens from the start side and navigates.
    await page.getByRole("button", { name: locale === "ar" ? "فتح القائمة" : "Open menu" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await page.context().close();
  }
});

test("design preview renders the product design system", async () => {
  await owner.goto(`${CONSOLE}/en/t/${slug}/appearance/preview`);
  await expect(owner.getByRole("heading", { name: "Featured this week" })).toBeVisible();
  await expect(owner.getByRole("article")).toHaveCount(4);
  await owner.getByText("500g").click();
  await owner.getByRole("button", { name: "Increase quantity" }).click();
  await expect(owner.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
  await expectNoA11yViolations(owner);
});
