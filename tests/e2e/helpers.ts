import { expect, type Page } from "@playwright/test";
export async function goFocus(
  page: Page,
  keywords = "Transformer, attention",
  focus = "Explore the connections between these ideas",
) {
  await goBuild(page);
  await page.locator("#focus").fill(focus);
  await page.locator("#terms").fill(keywords);
  await page.locator("#terms").blur();
}
export async function goBuild(page: Page) {
  if (await page.locator("#edit-setup").isVisible())
    await page.locator("#edit-setup").click();
  await expect(page.locator("#api-key")).toBeVisible();
}
export async function simplePaper(page: Page) {
  await page.locator("#document-file").setInputFiles({
    name: "transformer.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Abstract\n\nThe Transformer uses attention to connect its encoder and decoder.\n\nResults\n\nAttention is used in the Transformer encoder and decoder.",
    ),
  });
  await expect(page.locator("#document-summary")).toContainText(
    "Parsed locally",
  );
}
export async function openHistory(page: Page) {
  await page.locator("#menu-toggle").click();
  await page.locator("#show-history").click();
}
export async function menuClick(page: Page, selector: string) {
  await page.locator("#menu-toggle").click();
  await page.locator("#app-menu").locator(selector).click();
}
