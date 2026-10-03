import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function expectContained(page: Page, root: Locator) {
  const box = await root.locator(".evidence-panel").boundingBox();
  const graph = await root.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(Math.max(0, graph!.x));
  expect(box!.y).toBeGreaterThanOrEqual(Math.max(0, graph!.y));
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    Math.min(viewport.width, graph!.x + graph!.width),
  );
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    Math.min(viewport.height, graph!.y + graph!.height),
  );
  await expect(
    root.getByRole("button", { name: "Close evidence", exact: true }),
  ).toBeInViewport();
}

async function clickCanvasNode(root: Locator, id: string) {
  const canvas = root.locator(".graph-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const position = await canvas.evaluate((el, id) => {
    const cy = (
      el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
    )._cyreg.cy;
    return cy.getElementById(id).renderedPosition();
  }, id);
  await canvas.click({ position });
}

test("evidence stays over the graph at normal zoom on desktop, mobile, fullscreen and offline HTML", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#sample");
  let root = page.locator("#demo-graph");
  const panel = root.locator(".evidence-panel");
  await clickCanvasNode(root, "biomarkers");
  await expect(panel).toBeVisible();
  await expect(panel.locator("h3")).toHaveText("Microbial biomarkers");
  await expect(panel).not.toContainText("unavailable");
  await expect(panel.locator(".paper-citation").first()).toContainText(
    "Narang B",
  );
  await expect(panel.locator("blockquote")).toContainText(
    "microbial biomarkers",
  );
  await expectContained(page, root);
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(
    root.getByRole("button", { name: "Close evidence", exact: true }),
  ).toBeInViewport();
  await panel.locator('[data-edge="e2"]').click();
  await expect(panel.locator("blockquote")).toContainText(
    "microbial biomarkers",
  );
  await expect(panel.locator(".evidence-location")).toContainText(
    "05v1.pdf · PDF page 1",
  );
  await expectContained(page, root);
  await page.screenshot({ path: ".artifacts/evidence-overlay-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await root.locator('[data-action="fullscreen"]').click();
  await clickCanvasNode(root, "biomarkers");
  await expectContained(page, root);
  await root
    .getByRole("button", { name: "Close evidence", exact: true })
    .click();
  await root.locator('[data-action="fullscreen"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await clickCanvasNode(root, "biomarkers");
  await expectContained(page, root);
  await page.screenshot({ path: ".artifacts/evidence-overlay-mobile.png" });
  await page.keyboard.press("Escape");

  const html = await page.evaluate(async () => {
    const demoPath = "/src/ui/demo.ts",
      exportPath = "/src/graph/export.ts";
    const { demoAnalysis } = await import(/* @vite-ignore */ demoPath);
    const { htmlExport } = await import(/* @vite-ignore */ exportPath);
    return htmlExport(demoAnalysis());
  });
  await mkdir(".artifacts", { recursive: true });
  const path = resolve(".artifacts/evidence-sample.html");
  await writeFile(path, html);
  const offline = await context.newPage();
  await offline.setViewportSize({ width: 1280, height: 720 });
  const remote: string[] = [];
  offline.on("request", (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await offline.goto("file://" + path);
  root = offline.locator("#viewer");
  await clickCanvasNode(root, "biomarkers");
  await expectContained(offline, root);
  await expect(root.locator(".evidence-panel")).not.toContainText(
    "unavailable",
  );
  await expect(root.locator(".paper-citation a").first()).toHaveAttribute(
    "href",
    "https://doi.org/10.51248/v44i2.01",
  );
  await offline.screenshot({ path: ".artifacts/evidence-overlay-offline.png" });
  expect(remote).toEqual([]);
});
