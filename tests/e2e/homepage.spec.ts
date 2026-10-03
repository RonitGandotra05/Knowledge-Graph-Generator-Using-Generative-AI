import { goBuild } from "./helpers";
import { test, expect } from "@playwright/test";
import { simplePaper } from "./helpers";

test("homepage leads to the unified workspace and preserves work across home and sample", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#home h1")).toContainText("Your paper.");
  await expect(page.locator("#home h1 em")).toHaveText("perspective.");
  await expect(page.locator("#workspace")).toBeHidden();
  await expect(page.locator("#menu-toggle")).toBeVisible();
  await expect(page.locator("#app-menu")).toBeHidden();
  await page.screenshot({
    path: "docs/screenshots/home-dark.png",
    fullPage: true,
  });
  await page.locator("#menu-toggle").click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "docs/screenshots/home-light.png",
    fullPage: true,
  });
  await page.locator("#menu-toggle").click();
  await page.locator("#show-history").click();
  await expect(page.locator("#history-dialog")).toBeVisible();
  await page.locator("#close-history").click();
  await page.locator('#home .hero-actions a[href="#workspace"]').click();
  await expect(page.locator("#home")).toBeHidden();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".workflow-pages")).toHaveCount(0);
  await expect(page.locator("#focus")).toBeVisible();
  await expect(page.locator("#api-key")).toBeVisible();
  await simplePaper(page);
  await goBuild(page);
  await page.locator("#focus").fill("Study attention in the Transformer");
  await page.locator(".brand").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#home-demo").click();
  await expect(page.locator("#demo-section")).toBeVisible();
  await expect(page.locator("#demo-graph .graph-count")).toContainText(
    "18 concepts",
  );
  await page.locator("#close-demo").click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#home-start").click();
  await expect(page.locator("#focus")).toHaveValue(
    "Study attention in the Transformer",
  );
  await expect(page.locator("#focus")).toBeVisible();
  await page.locator(".brand").click();
  await page.goBack();
  await expect(page.locator("#workspace")).toBeVisible();
  await page.locator(".brand").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#menu-toggle")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/screenshots/home-mobile.png",
    fullPage: true,
  });
  await page.locator('#home .hero-actions a[href="#workspace"]').click();
  await expect(page.locator("#focus")).toHaveValue(
    "Study attention in the Transformer",
  );
});
