import { test, expect, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { menuClick } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
});

async function metrics(root: Locator) {
  return root.locator(".graph-canvas").evaluate((el) => {
    const cy = (el as any)._cyreg.cy,
      nodes = cy.nodes().toArray();
    const context = document.createElement("canvas").getContext("2d")!;
    const collisions: string[] = [],
      labels: string[] = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].boundingBox(),
          b = nodes[j].boundingBox();
        if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1)
          collisions.push(nodes[i].id());
      }
    for (const edge of cy.edges(":visible")) {
      if (!edge.style("label")) continue;
      const a = edge.boundingBox({
        includeNodes: false,
        includeEdges: false,
        includeLabels: true,
      });
      if (
        nodes.some((n: any) => {
          const b = n.boundingBox();
          return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
        })
      )
        labels.push(edge.id());
    }
    const bounds = cy.nodes().boundingBox();
    return {
      collisions,
      labels,
      width: bounds.w,
      height: bounds.h,
      nodeWidth: nodes[0].width(),
      font: parseFloat(nodes[0].style("font-size")),
      edgeFont: parseFloat(cy.edges()[0].style("font-size")),
      fits: nodes.every((n: any) => {
        const font = parseFloat(n.style("font-size"));
        context.font = `600 ${font}px system-ui`;
        const lines = n.data("displayLabel").split("\n"),
          w = Math.max(
            ...lines.map((l: string) => context.measureText(l).width),
          ),
          h = lines.length * font * 1.4;
        const shape = n.style("shape");
        return shape === "ellipse"
          ? (w / (n.width() - 12)) ** 2 + (h / (n.height() - 12)) ** 2 < 1
          : shape === "diamond"
            ? w / n.width() + h / n.height() < 1
            : w < n.width() - 8 && h < n.height() - 8;
      }),
      meanLength:
        cy.edges().reduce((sum: number, e: any) => {
          const a = e.source().position(),
            b = e.target().position();
          return sum + Math.hypot(a.x - b.x, a.y - b.y);
        }, 0) / cy.edges().length,
    };
  });
}

test("coordinated scaling, presets and every shape keep text inside nodes", async ({
  page,
}) => {
  const root = page.locator("#demo-graph");
  await root.locator(".graph-customize summary").click();
  const before = await metrics(root);
  await root.getByLabel("Overall graph size", { exact: true }).fill("60");
  const smaller = await metrics(root);
  expect(smaller.nodeWidth / before.nodeWidth).toBeCloseTo(0.6, 1);
  expect(smaller.font).toBe(9);
  expect(smaller.width).toBeLessThan(before.width * 0.8);
  expect(smaller.collisions).toEqual([]);
  expect(smaller.fits).toBe(true);
  for (const shape of ["circle", "card", "ellipse", "diamond"]) {
    await root.getByLabel("Node shape", { exact: true }).selectOption(shape);
    await root.getByLabel("Node size", { exact: true }).fill("70");
    await root.getByLabel("Node text size", { exact: true }).fill("24");
    await root.getByLabel("Connection text size", { exact: true }).fill("7");
    await root.getByLabel("Connection length", { exact: true }).fill("24");
    for (const layout of [
      "cose",
      "circle",
      "breadthfirst",
      "concentric",
      "grid",
    ]) {
      await root.getByLabel("Graph layout").selectOption(layout);
      const m = await metrics(root);
      expect(m.fits, shape + layout).toBe(true);
      expect(m.collisions, shape + layout).toEqual([]);
      expect(m.labels, shape + layout).toEqual([]);
    }
  }
  await root.locator('[data-action="appearance-reset"]').click();
  await expect(
    root.getByLabel("Overall graph size", { exact: true }),
  ).toHaveValue("100");
  await root.locator('[data-action="compact"]').click();
  await expect(
    root.getByLabel("Connection length", { exact: true }),
  ).toHaveValue("36");
  await expect(
    root.getByLabel("Connection text size", { exact: true }),
  ).toHaveValue("9");
  await root.getByLabel("Show connection labels").uncheck();
  const pending = page.waitForEvent("download");
  await root.locator(".graph-export summary").click();
  await root.locator('[data-action="svg"]').click();
  const svg = await readFile((await (await pending).path())!, "utf8");
  expect(svg).toContain("<polygon");
  expect(svg).toContain('font-size="12"');
  expect(svg).not.toContain("possibly associated");
});

test("concentric is compact and toggling settled physics preserves default density", async ({
  page,
}) => {
  const root = page.locator("#demo-graph"),
    physics = root.locator('[data-action="physics"]');
  const before = await metrics(root);
  await physics.click();
  await physics.click();
  await expect(root).toHaveAttribute("data-physics", "idle");
  const after = await metrics(root);
  expect(after.meanLength / before.meanLength).toBeGreaterThan(0.9);
  expect(after.meanLength / before.meanLength).toBeLessThan(1.1);
  await root.getByLabel("Graph layout").selectOption("concentric");
  const radial = await metrics(root);
  expect(Math.max(radial.width, radial.height)).toBeLessThan(2400);
  expect(radial.collisions).toEqual([]);
  expect(radial.labels).toEqual([]);
});

test("add concepts, notes and connections, rewire and delete from a friendly editor", async ({
  page,
}) => {
  const root = page.locator("#demo-graph");
  await root.locator('[data-action="add-node"]').click();
  await root.locator('[name="label"]').fill("Personal idea");
  await root
    .locator('[name="notes"]')
    .fill("A note\n<script>never execute</script>");
  await root
    .locator(".graph-editor")
    .getByRole("button", { name: "Add concept", exact: true })
    .click();
  await expect(root.locator(".concept-notes")).toHaveText(
    "A note\n<script>never execute</script>",
  );
  await expect(root.locator(".graph-count")).toContainText("10 concepts");
  await root.locator('[data-action="add-edge"]').click();
  await root.locator('[name="relationship"]').fill("my link");
  await root.locator('[name="explanation"]').fill("My description");
  await root
    .locator(".graph-editor")
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await expect(root.locator(".evidence-badge")).toHaveText("Your connection");
  await expect(root.locator(".evidence-content")).toContainText(
    "My description",
  );
  await expect(root.locator(".evidence-content blockquote")).toHaveCount(0);
  await root.locator('[data-action="edit-edge"]').click();
  await root.locator('[name="target"]').selectOption({ index: 1 });
  await root.locator('[name="explanation"]').fill("Changed description");
  await root
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(root.locator(".evidence-content")).toContainText(
    "Changed description",
  );
  await root.locator(".accessible-graph summary").click();
  await root
    .locator(".graph-list [data-node]")
    .filter({ hasText: "Personal idea" })
    .click();
  await root.locator('[data-action="edit-node"]').click();
  await root.locator('[data-action="manage-edge"]').click();
  await expect(root.locator(".graph-editor h3")).toHaveText(
    "Edit relationship",
  );
  await root.locator('[data-action="delete-edge"]').click();
  await root.locator('[data-action="confirm-delete"]').click();
  await expect(root.locator(".graph-count")).toContainText(
    "10 concepts · 8 relationships",
  );
  await root.locator('[data-action="undo"]').click();
  await expect(root.locator(".graph-count")).toContainText("9 relationships");
});

test("multi-select by list and canvas, cascading deletion and undo/redo", async ({
  page,
}) => {
  const root = page.locator("#demo-graph");
  await root.locator('[data-action="select-mode"]').click();
  await root.locator(".accessible-graph summary").click();
  await root.locator(".graph-list [data-node]").nth(0).click();
  await root.locator(".graph-list [data-node]").nth(1).click();
  await expect(root.locator(".selection-bar span")).toContainText(
    "2 concepts selected",
  );
  await root.locator('[data-action="delete-selected"]').click();
  await expect(root.locator(".graph-count")).toContainText("7 concepts");
  await root.locator('[data-action="undo"]').click();
  await expect(root.locator(".graph-count")).toContainText(
    "9 concepts · 8 relationships",
  );
  await root.locator('[data-action="redo"]').click();
  await expect(root.locator(".graph-count")).toContainText("7 concepts");
  await root.locator('[data-action="undo"]').click();
  await root.locator('[data-action="select-all"]').click();
  await expect(root.locator(".selection-bar span")).toContainText(
    "9 concepts selected",
  );
  await root.locator('[data-action="clear-selection"]').click();
  await expect(root.locator('[data-action="delete-selected"]')).toBeDisabled();
  await root.locator('[data-action="fit"]').click();
  const canvas = root.locator(".graph-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(root.locator(".selection-bar span")).toContainText(
    "9 concepts selected",
  );
  await root.locator('[data-action="clear-selection"]').click();
  // A modifier click on a real rendered canvas node also selects it.
  await root.locator('[data-action="select-mode"]').click();
  await root.locator('[data-action="fit"]').click();
  const p = await root
    .locator(".graph-canvas")
    .evaluate((el) => (el as any)._cyreg.cy.nodes()[0].renderedPosition());
  await root
    .locator(".graph-canvas")
    .click({ position: p, modifiers: ["Shift"] });
  await expect(root.locator(".selection-bar span")).toContainText(
    "1 concepts selected",
  );
});

test("inspector drags, moves by keyboard and stays reachable on mobile", async ({
  page,
}) => {
  const root = page.locator("#demo-graph");
  await root.locator(".accessible-graph summary").click();
  await root.locator(".graph-list [data-node]").first().click();
  const header = root.locator(".evidence-header"),
    panel = root.locator(".evidence-panel");
  const before = (await header.boundingBox())!;
  await page.mouse.move(before.x + 70, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x - 160, before.y + 40, { steps: 8 });
  await page.mouse.up();
  const dragged = (await panel.boundingBox())!;
  expect(dragged.x).toBeLessThan(before.x - 100);
  await header.focus();
  await page.keyboard.press("ArrowRight");
  expect((await panel.boundingBox())!.x).toBeGreaterThan(dragged.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const mobile = await panel.boundingBox();
      return mobile ? mobile.x + mobile.width : Infinity;
    })
    .toBeLessThanOrEqual(390);
  expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await expect(root.locator('[data-action="close-evidence"]')).toBeVisible();
  await root.locator('[data-action="close-evidence"]').click();
  await expect(panel).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("customized personal graphs reopen offline, export again and recover from browser history", async ({
  page,
  context,
}) => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const html = await page.evaluate(async () => {
    const demoPath = "/src/ui/demo.ts",
      editPath = "/src/graph/edit.ts",
      exportPath = "/src/graph/export.ts",
      draftsPath = "/src/storage/drafts.ts";
    const { demoAnalysis } = await import(demoPath),
      { addNode, addRelationship } = await import(editPath),
      { htmlExport } = await import(exportPath),
      { drafts } = await import(draftsPath);
    const a = demoAnalysis();
    a.id = "custom-personal-draft";
    a.name = "Personal compact graph";
    a.graph = addNode(
      a.graph,
      "Personal idea",
      "Personal",
      "#abcdef",
      "A persisted note",
    );
    a.graph = addRelationship(
      a.graph,
      a.graph.nodes.at(-1).id,
      a.graph.nodes[0].id,
      "my link",
      "My personal description",
    );
    a.settings = {
      ...a.settings,
      graphScale: 0.7,
      nodeSize: 0.9,
      edgeLength: 30,
      edgeFontSize: 8,
      nodeFontSize: 14,
      nodeShape: "ellipse",
      showEdgeLabels: false,
    };
    await drafts.save({
      id: a.id,
      name: a.name,
      updatedAt: new Date().toISOString(),
      status: "complete",
      step: 2,
      focus: "personal",
      keywords: "",
      document: null,
      concepts: a.concepts,
      options: {
        maxNodes: 150,
        maxEdges: 500,
        contextTokens: 6000,
        includeInferred: false,
      },
      provider: {
        provider: "groq",
        model: "test",
        endpoint: "https://api.groq.com",
      },
      analysis: a,
    });
    return htmlExport(a);
  });
  await mkdir(".artifacts", { recursive: true });
  const path = join(process.cwd(), ".artifacts/custom-personal.html");
  await writeFile(path, html);
  const offline = await context.newPage();
  const network: string[] = [],
    errors: string[] = [];
  offline.on("request", (r) => {
    if (r.url().startsWith("http")) network.push(r.url());
  });
  offline.on("pageerror", (e) => errors.push(e.message));
  await offline.goto("file://" + path);
  await expect(offline.locator(".graph-count")).toContainText(
    "10 concepts · 9 relationships",
  );
  await offline.locator(".graph-customize summary").click();
  await expect(
    offline.getByLabel("Overall graph size", { exact: true }),
  ).toHaveValue("70");
  await expect(
    offline.getByLabel("Connection length", { exact: true }),
  ).toHaveValue("30");
  await expect(offline.getByLabel("Show connection labels")).not.toBeChecked();
  await expect(offline.getByLabel("Node shape", { exact: true })).toHaveValue(
    "ellipse",
  );
  await offline.locator(".accessible-graph summary").click();
  await offline
    .locator(".graph-list [data-node]")
    .filter({ hasText: "Personal idea" })
    .click();
  await expect(offline.locator(".concept-notes")).toHaveText(
    "A persisted note",
  );
  await offline.locator('[data-action="edit-node"]').click();
  await offline.locator('[name="notes"]').fill("Updated offline note");
  await offline
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  await offline.locator(".relationship-card").click();
  await expect(offline.locator(".evidence-badge")).toHaveText(
    "Your connection",
  );
  await expect(offline.locator(".evidence-content")).toContainText(
    "My personal description",
  );
  const pending = offline.waitForEvent("download");
  await offline.locator("#html").click();
  const nextPath = join(
    process.cwd(),
    ".artifacts/custom-personal-edited.html",
  );
  await (await pending).saveAs(nextPath);
  await offline.goto("file://" + nextPath);
  await expect(offline.locator(".graph-count")).toContainText(
    "10 concepts · 9 relationships",
  );
  await offline.locator(".accessible-graph summary").click();
  await offline
    .locator(".graph-list [data-node]")
    .filter({ hasText: "Personal idea" })
    .click();
  await expect(offline.locator(".concept-notes")).toHaveText(
    "Updated offline note",
  );
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
  await offline.close();
  await page.reload();
  await menuClick(page, "#show-history");
  await page
    .locator(".history-card")
    .filter({ hasText: "Personal compact graph" })
    .locator("[data-open]")
    .click();
  const root = page.locator("#graph-root");
  await expect(root.locator(".graph-count")).toContainText(
    "10 concepts · 9 relationships",
  );
  await root.locator(".graph-customize summary").click();
  await expect(
    root.getByLabel("Overall graph size", { exact: true }),
  ).toHaveValue("70");
  await expect(
    root.getByLabel("Connection length", { exact: true }),
  ).toHaveValue("30");
  await expect(root.getByLabel("Node shape", { exact: true })).toHaveValue(
    "ellipse",
  );
  await page.screenshot({
    path: ".artifacts/customization-preview.png",
    fullPage: true,
  });
});
