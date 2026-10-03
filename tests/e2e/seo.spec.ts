import { test, expect } from "@playwright/test";

test("public research content and links are available without JavaScript", async ({
  browser,
  baseURL,
  request,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#home h1")).toBeVisible();
  await expect(page.locator("#home")).toContainText(
    "interactive knowledge graphs",
  );
  await expect(page.locator(".app-header")).toHaveCount(1);
  await expect(page.locator(".header-guide")).toHaveAttribute(
    "target",
    "_blank",
  );
  const home = await request.get("/");
  expect(await home.text()).toContain('id="home-start"');
  for (const path of ["/", "/guide/"]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://evidence-atlas.netlify.app${path}`,
    );
    await expect(page).toHaveTitle(/Knowledge Graph/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /index, follow/,
    );
    const structured = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(structured.length).toBeGreaterThan(0);
    for (const json of structured) {
      expect(JSON.parse(json)["@context"]).toBe("https://schema.org");
      expect(json).not.toMatch(/aggregateRating|reviewRating/);
    }
  }
  await expect(page.locator("h1")).toContainText("How to use Evidence Atlas");
  await expect(
    page.getByRole("link", { name: "Evidence Atlas homepage" }),
  ).toHaveAttribute("href", "/");
  for (const theme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Open workspace" }),
    ).toBeVisible();
  }
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(
    "Sitemap: https://evidence-atlas.netlify.app/sitemap.xml",
  );
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    "<loc>https://evidence-atlas.netlify.app/guide/</loc>",
  );
  await context.close();
});

test("the rendered homepage hydrates once and keeps workspace state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".app-header")).toHaveCount(1);
  await page.locator("#home-start").click();
  await page.locator("#focus").fill("Study networks and materials");
  await page.locator(".brand").click();
  const [guide] = await Promise.all([
    page.waitForEvent("popup"),
    page.locator(".header-guide").click(),
  ]);
  await expect(guide.locator("h1")).toContainText("How to use Evidence Atlas");
  await guide.close();
  await page.locator("#home-start").click();
  await expect(page.locator("#focus")).toHaveValue(
    "Study networks and materials",
  );
  expect(errors).toEqual([]);
});
