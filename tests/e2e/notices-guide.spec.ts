import { test, expect } from "@playwright/test";
import { simplePaper, openHistory } from "./helpers";

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`notices remain readable and dismissible at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".header-guide")).toBeVisible();
    for (const name of ["privacy", "security", "terms", "license"]) {
      if (name !== "license") await page.locator("#menu-toggle").click();
      await page
        .locator(`[data-info="${name}"]`)
        .filter({ visible: true })
        .first()
        .click();
      const dialog = page.locator("#info-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".notice-list > div").first()).toBeVisible();
      await expect(dialog.locator(".notice-list dd").first()).toHaveCSS(
        "font-size",
        "14px",
      );
      const summary = dialog.locator(".notice-details > summary");
      if (await summary.count()) await summary.click();
      await dialog.locator(".info-content").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      const close = dialog.getByRole("button", { name: "Close information" });
      await expect(close).toBeInViewport();
      if (name === "privacy")
        await page.screenshot({
          path: `.artifacts/privacy-notice-${viewport.width}.png`,
        });
      await close.click();
      await expect(dialog).toBeHidden();
    }
    await page.goto("/#workspace");
    await expect(
      page.locator(".workspace-actions #new-analysis"),
    ).toBeVisible();
    await expect(page.locator(".header-guide")).toBeInViewport();
    const help = await page.locator(".header-guide").boundingBox();
    const menu = await page.locator("#menu-toggle").boundingBox();
    const brand = await page.locator(".brand").boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(help!.x);
    expect(help!.x + help!.width).toBeLessThanOrEqual(menu!.x);
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      actual: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll("#workspace *"))
        .filter(
          (el) =>
            el.getBoundingClientRect().right > innerWidth &&
            el.getBoundingClientRect().width > 0,
        )
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          id: el.id,
          right: el.getBoundingClientRect().right,
        }))
        .slice(0, 30),
    }));
    expect(width.actual, JSON.stringify(width)).toBeLessThanOrEqual(
      width.viewport,
    );
    await page.locator("#key-info").click();
    await expect(page.locator("#key-privacy")).toBeVisible();
    const tooltip = await page.locator("#key-privacy").boundingBox();
    expect(tooltip!.x).toBeGreaterThanOrEqual(0);
    expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    await expect(page.locator("#key-privacy")).toBeHidden();
  });
}

test("How to use opens the guide directly and keeps workspace inputs intact", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await page.locator("#focus").fill("Compare reported findings");
  await page.locator("#api-key").fill("TEST-KEY-ONLY");
  await expect(page.locator('[data-info="how"]')).toHaveCount(0);
  const opened = page.waitForEvent("popup");
  await page.locator(".header-guide").click();
  const guide = await opened;
  await expect(guide).toHaveURL(/\/guide\/$/);
  await expect(guide.locator("h1")).toHaveText("How to use Evidence Atlas");
  await expect(guide.locator("#build li")).toHaveCount(4);
  await expect(guide.locator("#evidence")).toContainText("Go to this line");
  await expect(guide.locator("#evidence")).toContainText("same tab");
  expect(
    await guide.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await guide.screenshot({
    path: ".artifacts/how-to-use-guide.png",
    fullPage: true,
  });
  await guide.close();
  await expect(page.locator("#focus")).toHaveValue("Compare reported findings");
  await expect(page.locator("#api-key")).toHaveValue("TEST-KEY-ONLY");
  await expect(page.locator("#info-dialog")).toBeHidden();
});

test("history confirmation keeps Cancel separate from deletion", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await simplePaper(page);
  await expect(page.locator("#draft-state")).toContainText("Saved");
  await openHistory(page);
  await expect(page.locator("#history-items [data-open]")).toHaveCount(1);
  await page.locator("#clear-history").click();
  const dialog = page.locator("#confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("cannot be undone");
  await expect(dialog.locator("#confirm-delete")).toHaveClass(/danger/);
  await page.locator("#cancel-delete").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#history-items [data-open]")).toHaveCount(1);
});
