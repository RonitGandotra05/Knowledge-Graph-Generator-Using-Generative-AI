import { test, expect } from "@playwright/test";
import { menuClick } from "./helpers";

test("both node shapes reserve their labels and remain separate in every layout", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
  const root = page.locator("#demo-graph"),
    canvas = root.locator(".graph-canvas");
  for (const shape of ["circle", "card"]) {
    await root.locator('select[aria-label="Node shape"]').selectOption(shape);
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
      const result = await canvas.evaluate((el) => {
        const cy = (
          el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
        )._cyreg.cy;
        const nodes = cy.nodes().toArray(),
          overlaps: string[] = [];
        for (let i = 0; i < nodes.length; i++)
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].boundingBox(),
              b = nodes[j].boundingBox();
            if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1)
              overlaps.push(nodes[i].id() + ":" + nodes[j].id());
          }
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = "600 15px system-ui";
        return {
          overlaps,
          shapes: nodes.map((n) => n.style("shape")),
          fits: nodes.every((n) => {
            const lines = String(n.data("displayLabel")).split("\n"),
              width = Math.max(
                ...lines.map((line) => context.measureText(line).width),
              ),
              height = lines.length * 21;
            return n.style("shape") === "ellipse"
              ? Math.hypot(width, height) < n.width() - 16
              : width < n.width() - 16 && height < n.height() - 16;
          }),
        };
      });
      expect(result.overlaps, shape + layout).toEqual([]);
      expect(result.fits, shape + layout).toBe(true);
      expect(
        result.shapes.every(
          (s) => s === (shape === "circle" ? "ellipse" : "round-rectangle"),
        ),
      ).toBe(true);
    }
    await root
      .locator('select[aria-label="Graph layout"]')
      .selectOption("cose");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await root.screenshot({ path: "docs/screenshots/nodes-" + shape + ".png" });
    await root.locator(".graph-export summary").click();
    const pending = page.waitForEvent("download");
    await root.locator('[data-action="svg"]').click();
    const download = await pending;
    const { readFile } = await import("node:fs/promises");
    const svg = await readFile((await download.path())!, "utf8");
    expect(
      shape === "circle"
        ? (svg.match(/<circle /g) || []).length
        : (svg.match(/rx="12"/g) || []).length,
    ).toBe(9);
    await root.locator(".graph-export summary").click();
  }
});

test("physics separates collisions, pins the dragged node, settles and can be paused", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
  const root = page.locator("#demo-graph"),
    canvas = root.locator(".graph-canvas"),
    physics = root.locator('[data-action="physics"]');
  await expect(physics).toHaveAttribute("aria-pressed", "true");
  await physics.click();
  await expect(physics).toHaveAttribute("aria-pressed", "false");
  await canvas.evaluate((el) => {
    const cy = (
      el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
    )._cyreg.cy;
    const nodes = cy.nodes();
    nodes[0].position({ x: 400, y: 300 });
    nodes[1].position({ x: 400, y: 300 });
    nodes[0].emit("dragfree");
  });
  expect(
    await canvas.evaluate((el) => {
      const cy = (
        el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
      )._cyreg.cy;
      return cy.nodes()[0].position("x") === cy.nodes()[1].position("x");
    }),
  ).toBe(true);
  await physics.click();
  await expect(root).toHaveAttribute("data-physics", "settling");
  await expect(root).toHaveAttribute("data-physics", "idle", { timeout: 5000 });
  await canvas.evaluate((el) => {
    const cy = (
      el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
    )._cyreg.cy;
    const nodes = cy.nodes();
    nodes[0].position({ x: 400, y: 300 });
    nodes[1].position({ x: 400, y: 300 });
    nodes[0].emit("dragfree");
  });
  await expect(root).toHaveAttribute("data-physics", "settling");
  await expect(root).toHaveAttribute("data-physics", "idle", { timeout: 5000 });
  const result = await canvas.evaluate((el) => {
    const cy = (
      el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
    )._cyreg.cy;
    const a = cy.nodes()[0],
      b = cy.nodes()[1],
      ab = a.boundingBox(),
      bb = b.boundingBox();
    return {
      position: a.position(),
      overlap: ab.x1 < bb.x2 && ab.x2 > bb.x1 && ab.y1 < bb.y2 && ab.y2 > bb.y1,
    };
  });
  expect(result.position).toEqual({ x: 400, y: 300 });
  expect(result.overlap).toBe(false);
  await canvas.evaluate((el) =>
    (el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } })._cyreg.cy
      .nodes()[0]
      .emit("dragfree"),
  );
  await physics.click();
  await expect(root).toHaveAttribute("data-physics", "idle");
  await expect(physics).toHaveAttribute("aria-pressed", "false");
});

test("a dense 60-node graph preserves all labels, separates both shapes and offers a readable view", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await page.evaluate(async () => {
    const viewerPath = "/src/graph/viewer.ts",
      demoPath = "/src/ui/demo.ts";
    const { GraphViewer } = await import(viewerPath),
      { demoAnalysis } = await import(demoPath);
    const analysis = demoAnalysis();
    const seed = analysis.graph.nodes[0];
    analysis.graph.nodes = Array.from({ length: 60 }, (_, i) => ({
      ...seed,
      id: `stress-${i}`,
      label: `Microbial biomarker K${20000 + i}`,
      aliases: [],
    }));
    const edge = analysis.graph.edges[0];
    analysis.graph.edges = analysis.graph.nodes
      .slice(1)
      .map((n: { id: string }, i: number) => ({
        ...edge,
        id: `stress-edge-${i}`,
        source: "stress-0",
        target: n.id,
      }));
    const root = document.createElement("div");
    root.id = "dense-graph";
    document.body.append(root);
    new GraphViewer(root, analysis);
  });
  const root = page.locator("#dense-graph");
  for (const shape of ["circle", "card"]) {
    await root.locator('select[aria-label="Node shape"]').selectOption(shape);
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
      const result = await root.locator(".graph-canvas").evaluate((el) => {
        const cy = (el as any)._cyreg.cy,
          nodes = cy.nodes().toArray(),
          collisions = [];
        for (let i = 0; i < nodes.length; i++)
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].boundingBox(),
              b = nodes[j].boundingBox();
            if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1)
              collisions.push([i, j]);
          }
        return {
          count: nodes.length,
          labels: nodes.every((n: any) =>
            n.data("displayLabel").includes("Microbial"),
          ),
          font: 15 * cy.zoom(),
          collisions,
        };
      });
      expect(result.count).toBe(60);
      expect(result.labels).toBe(true);
      expect(result.collisions, shape + layout).toEqual([]);
      expect(result.font).toBeGreaterThanOrEqual(12);
    }
  }
  await root.locator('[data-action="fit"]').click();
  await root.locator('[data-action="readable"]').click();
  expect(
    await root
      .locator(".graph-canvas")
      .evaluate((el) => 15 * (el as any)._cyreg.cy.zoom()),
  ).toBeGreaterThanOrEqual(12);
});
