import { test, expect } from "@playwright/test";
import { demoAnalysis } from "../../src/ui/demo";

for (const viewport of [
  { width: 1465, height: 746 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`normal graph view stays visible and page-scrollable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (viewport.width === 1465)
      await page.addInitScript(() =>
        localStorage.setItem("evidence-atlas-theme", "light"),
      );
    await page.goto("/#workspace");
    const analysis = demoAnalysis();
    if (viewport.width === 1465) analysis.settings.theme = "light";
    const originals = analysis.graph.nodes;
    analysis.graph.nodes = Array.from({ length: 47 }, (_, i) => ({
      ...originals[i % originals.length],
      id: i < originals.length ? originals[i].id : `extra-${i}`,
      label:
        i < originals.length ? originals[i].label : `Research concept ${i}`,
      type: `Research entity classification ${i}`,
      aliases: [],
    }));
    await page.locator("#import-file").setInputFiles({
      name: "many-entity-types.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(analysis)),
    });
    const root = page.locator("#graph-root");
    const stage = root.locator(".graph-stage");
    await expect(root.locator(".graph-count")).toContainText("47 concepts");
    await expect
      .poll(async () => {
        const box = await stage.boundingBox();
        return Math.max(
          0,
          Math.min(viewport.height, box!.y + box!.height) - Math.max(0, box!.y),
        );
      })
      .toBeGreaterThan(viewport.width < 760 ? 200 : 380);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    const filters = root.locator(".graph-filter");
    expect((await filters.boundingBox())!.height).toBeLessThanOrEqual(
      viewport.width < 760 ? 84 : 96,
    );
    expect(
      await filters.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await filters.locator("input[data-type]").last().uncheck();
    await expect(root.locator(".graph-count")).toContainText("46 concepts");
    await expect(root.locator(".graph-export > div")).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    const zoom = () =>
      root
        .locator(".graph-canvas")
        .evaluate((el) => (el as any)._cyreg.cy.zoom());
    await root.locator('[data-action="fit"]').click();
    const beforeZoom = await zoom();
    const beforeScroll = await page.evaluate(() => scrollY);
    const box = await stage.boundingBox();
    await page.mouse.move(
      box!.x + box!.width / 2,
      Math.min(viewport.height - 40, box!.y + 180),
    );
    await page.mouse.wheel(0, -240);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeLessThan(beforeScroll - 50);
    expect(await zoom()).toBeCloseTo(beforeZoom, 5);
    if (viewport.width > 760) {
      const canvasBox = await stage.boundingBox();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2,
        Math.max(60, canvasBox!.y + 180),
      );
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120);
      await page.keyboard.up("Control");
      await expect.poll(zoom).toBeGreaterThan(beforeZoom);
      await root.locator('[data-action="fit"]').click();
    }
    await filters.evaluate((el) => (el.scrollTop = 0));
    await root.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: `output/evaluation/graph-visibility/normal-${viewport.width}.png`,
    });
    if (viewport.width === 1465) {
      await root.locator('[data-action="fullscreen"]').click();
      await expect
        .poll(() => page.evaluate(() => !!document.fullscreenElement))
        .toBe(true);
      await expect
        .poll(async () => (await stage.boundingBox())!.height)
        .toBeGreaterThan(450);
      await root.locator('[data-action="fullscreen"]').click();
      await expect
        .poll(() => page.evaluate(() => !!document.fullscreenElement))
        .toBe(false);
    }
  });
}
