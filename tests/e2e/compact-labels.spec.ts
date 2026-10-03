import { test, expect } from "@playwright/test";
import { menuClick } from "./helpers";

async function labelMetrics(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((el) => {
    const cy = (el as any)._cyreg.cy;
    const nodes = cy.nodes(":visible").toArray();
    const boxes = [] as any[],
      missing = [] as string[],
      detached = [] as string[],
      collisions = [] as string[];
    for (const e of cy.edges(":visible")) {
      const box = e.boundingBox({
        includeNodes: false,
        includeEdges: false,
        includeLabels: true,
      });
      const mid = e.midpoint();
      if (
        !Number.isFinite(mid?.x) ||
        !Number.isFinite(mid?.y) ||
        !Number.isFinite(box.x1) ||
        box.w <= 0 ||
        box.h <= 0 ||
        !e.style("label")
      )
        missing.push(e.id());
      if (
        parseFloat(e.style("text-margin-x")) !== 0 ||
        parseFloat(e.style("text-margin-y")) !== 0 ||
        Math.abs((box.x1 + box.x2) / 2 - mid.x) > 2 ||
        Math.abs((box.y1 + box.y2) / 2 - mid.y) > 2
      )
        detached.push(e.id());
      const hits = (b: any) =>
        box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1;
      if (nodes.some((n: any) => hits(n.boundingBox())) || boxes.some(hits))
        collisions.push(e.id());
      boxes.push(box);
    }
    return {
      missing,
      detached,
      collisions,
      count: boxes.length,
      zoom: cy.zoom(),
      width: cy.nodes().boundingBox().w,
      nodeFont: parseFloat(cy.nodes()[0].style("font-size")) * cy.zoom(),
      edgeFont: parseFloat(cy.edges()[0].style("font-size")) * cy.zoom(),
      center: {
        x:
          (cy.elements(":visible").renderedBoundingBox().x1 +
            cy.elements(":visible").renderedBoundingBox().x2) /
          2,
        y:
          (cy.elements(":visible").renderedBoundingBox().y1 +
            cy.elements(":visible").renderedBoundingBox().y2) /
          2,
      },
      viewport: { width: cy.width(), height: cy.height() },
      routes: cy.edges().map((e: any) => ({
        id: e.id(),
        mid: e.midpoint(),
        box: e.boundingBox({
          includeNodes: false,
          includeEdges: false,
          includeLabels: true,
        }),
        bend: e.style("control-point-distances"),
      })),
    };
  });
}

test("labels stay visible on their real curves at minimum sizing in every layout", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
  const root = page.locator("#demo-graph"),
    canvas = root.locator(".graph-canvas");
  await root.locator(".graph-customize summary").click();
  await root.getByLabel("Overall graph size", { exact: true }).fill("10");
  await root.getByLabel("Node size", { exact: true }).fill("15");
  await root.getByLabel("Connection length", { exact: true }).fill("0");
  for (const shape of ["circle", "card", "ellipse", "diamond"]) {
    await root.getByLabel("Node shape", { exact: true }).selectOption(shape);
    for (const layout of [
      "cose",
      "circle",
      "concentric",
      "grid",
      "breadthfirst",
    ]) {
      await root.getByLabel("Graph layout").selectOption(layout);
      const m = await labelMetrics(canvas);
      expect(m.count).toBe(8);
      expect(m.missing, JSON.stringify(m.routes)).toEqual([]);
      expect(m.detached, shape + layout).toEqual([]);
      expect(m.collisions, shape + layout).toEqual([]);
      expect(m.zoom).toBeLessThanOrEqual(1.25);
      expect(Math.abs(m.center.x - m.viewport.width / 2)).toBeLessThan(2);
      expect(Math.abs(m.center.y - m.viewport.height / 2)).toBeLessThan(2);
    }
  }
  await root.getByLabel("Node text size", { exact: true }).fill("4");
  await root.getByLabel("Connection text size", { exact: true }).fill("4");
  await root.locator('[data-action="readable"]').click();
  const readable = await labelMetrics(canvas);
  expect(readable.nodeFont).toBeGreaterThanOrEqual(12);
  expect(readable.edgeFont).toBeGreaterThanOrEqual(9);
  expect(readable.missing).toEqual([]);
  await root.screenshot({ path: ".artifacts/compact-minimum.png" });
});

test("PDF graph labels remain attached through scaling, dragging, themes and zoom", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const file = "output/evaluation/gemini-nejm/NEJMoa2035389.json";
  test.skip(
    !process.env.ATLAS_NEJM_VISUAL,
    "Opt in after generating the authorized PDF graph",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#workspace");
  await page.locator("#import-file").setInputFiles({
    name: "NEJMoa2035389.json",
    mimeType: "application/json",
    buffer: await readFile(file),
  });
  const root = page.locator("#graph-root"),
    canvas = root.locator(".graph-canvas");
  await root.locator(".graph-customize summary").click();
  for (const layout of [
    "cose",
    "concentric",
    "circle",
    "breadthfirst",
    "grid",
  ]) {
    await root.getByLabel("Graph layout").selectOption(layout);
    for (const size of [100, 50, 10]) {
      await root
        .getByLabel("Overall graph size", { exact: true })
        .fill(String(size));
      await root
        .getByLabel("Node size", { exact: true })
        .fill(size === 100 ? "100" : "15");
      await root.getByLabel("Connection length", { exact: true }).fill("0");
      const m = await labelMetrics(canvas);
      // Import rejects the unsupported stated Bell’s palsy cause.
      expect(m.count).toBe(23);
      expect(m.missing, layout + size + JSON.stringify(m.routes)).toEqual([]);
      expect(m.detached, layout + size).toEqual([]);
      expect(m.collisions, layout + size).toEqual([]);
    }
  }
  await root.getByLabel("Overall graph size", { exact: true }).fill("50");
  await root.getByLabel("Node size", { exact: true }).fill("70");
  await root.getByLabel("Node text size", { exact: true }).fill("12");
  await root.getByLabel("Connection text size", { exact: true }).fill("10");
  for (const layout of ["cose", "concentric", "grid"]) {
    await root.getByLabel("Graph layout").selectOption(layout);
    for (const theme of ["dark", "light"]) {
      if ((await root.getAttribute("data-theme")) !== theme)
        await root.locator('[data-action="theme"]').click();
      await root.locator('[data-action="fit"]').click();
      await canvas.screenshot({
        path: `.artifacts/nejm-${layout}-${theme}-overview.png`,
      });
      await root.locator('[data-action="readable"]').click();
      await canvas.screenshot({
        path: `.artifacts/nejm-${layout}-${theme}-readable.png`,
      });
      const m = await labelMetrics(canvas);
      expect(m.missing).toEqual([]);
      expect(m.detached).toEqual([]);
      expect(m.collisions).toEqual([]);
    }
  }
  await root.getByLabel("Graph layout").selectOption("grid");
  await root.locator('[data-action="readable"]').click();
  await canvas.scrollIntoViewIfNeeded();
  const point = await canvas.evaluate((el) => {
    const cy = (el as any)._cyreg.cy;
    return cy
      .nodes()
      .map((n: any) => n.renderedPosition())
      .find(
        (p: any) =>
          p.x > 40 &&
          p.y > 40 &&
          p.x < cy.width() - 90 &&
          p.y < cy.height() - 90,
      );
  });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x + 35, box.y + point.y + 25, {
    steps: 5,
  });
  expect((await labelMetrics(canvas)).detached).toEqual([]);
  await page.mouse.up();
  expect((await labelMetrics(canvas)).missing).toEqual([]);
  expect((await labelMetrics(canvas)).detached).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await root.locator('[data-action="readable"]').click();
  expect((await labelMetrics(canvas)).missing).toEqual([]);
  expect((await labelMetrics(canvas)).detached).toEqual([]);
  await canvas.screenshot({ path: ".artifacts/nejm-mobile.png" });
});
