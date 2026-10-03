import { test, expect } from "@playwright/test";
import { menuClick } from "./helpers";

test("sample labels fit inside separate cards in every layout and theme", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
  const root = page.locator("#demo-graph");
  const canvas = root.locator(".graph-canvas");
  await root.locator('select[aria-label="Node shape"]').selectOption("card");
  await expect(root.locator(".graph-count")).toContainText("9 concepts");
  await expect(root.locator(".evidence-panel")).toBeHidden();
  for (const layout of [
    "cose",
    "circle",
    "breadthfirst",
    "concentric",
    "grid",
  ]) {
    await root
      .locator('select[aria-label="Graph layout"]')
      .selectOption(layout);
    const metrics = await canvas.evaluate((el) => {
      const cy = (
        el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
      )._cyreg.cy;
      const nodes = cy.nodes().toArray();
      const overlaps: string[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i].boundingBox();
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j].boundingBox();
          if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1)
            overlaps.push(nodes[i].id() + ":" + nodes[j].id());
        }
      }
      const labelCollisions = cy
        .edges()
        .filter((edge) => {
          const a = edge.boundingBox({
            includeNodes: false,
            includeEdges: false,
            includeLabels: true,
          });
          return nodes.some((node) => {
            const b = node.boundingBox();
            return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
          });
        })
        .map((edge) => edge.id());
      return {
        overlaps,
        labelCollisions,
        cards: nodes.every(
          (node) =>
            node.style("shape") === "round-rectangle" &&
            node.style("text-valign") === "center",
        ),
        labels: nodes.map((node) =>
          String(node.data("displayLabel")).replace(/\n/g, " "),
        ),
        fontSize: cy.zoom() * 15,
      };
    });
    expect(metrics.overlaps, layout).toEqual([]);
    expect(metrics.labelCollisions, layout).toEqual([]);
    expect(metrics.cards).toBe(true);
    expect(metrics.labels).toContain("Autism spectrum disorder");
    if (layout === "cose") expect(metrics.fontSize).toBeGreaterThan(11);
  }
  await root.locator('select[aria-label="Graph layout"]').selectOption("cose");
  await root.screenshot({ path: "docs/screenshots/spacious-sample-dark.png" });
  await root.locator('[data-action="theme"]').click();
  await root.screenshot({ path: "docs/screenshots/spacious-sample-light.png" });
  await root.locator(".accessible-graph summary").click();
  await root.locator("[data-node]").first().click();
  await expect(root.locator(".evidence-panel")).toBeVisible();
  const stage = await root.locator(".graph-stage").boundingBox();
  const inspector = await root.locator(".evidence-panel").boundingBox();
  expect(inspector!.y).toBeGreaterThanOrEqual(Math.max(0, stage!.y));
  expect(inspector!.y).toBeLessThan(stage!.y + stage!.height);
  await root.locator(".graph-export summary").click();
  const pending = page.waitForEvent("download");
  await root.locator('[data-action="svg"]').click();
  const download = await pending;
  const { readFile } = await import("node:fs/promises");
  const svg = await readFile((await download.path())!, "utf8");
  expect(svg).toContain("<tspan");
  expect(svg).toContain('rx="12"');
  expect(svg).toContain("Autism spectrum");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
