import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("connected NEJM sample opens without AI calls and cites highlighted paper evidence", async ({
  page,
}) => {
  const calls: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      /api\.groq\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(
        r.url(),
      )
    )
      calls.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/#sample");
  const root = page.locator("#demo-graph");
  await expect(root.locator(".graph-count")).toHaveText(
    "18 concepts · 19 relationships",
  );
  await expect(root.getByLabel("Graph layout")).toHaveValue("concentric");
  await expect(root.locator('[data-action="physics"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const audit = await root.locator(".graph-canvas").evaluate((el) => {
    const cy = (el as any)._cyreg.cy;
    return {
      disconnected: cy
        .nodes()
        .filter((n: any) => !n.degree())
        .map((n: any) => n.id()),
      empty: cy
        .nodes()
        .filter((n: any) => !n.data("label").trim())
        .map((n: any) => n.id()),
      missing: cy
        .edges()
        .filter(
          (e: any) =>
            !e.style("label") ||
            e.boundingBox({
              includeNodes: false,
              includeEdges: false,
              includeLabels: true,
            }).w <= 0,
        )
        .map((e: any) => e.id()),
    };
  });
  expect(audit).toEqual({ disconnected: [], empty: [], missing: [] });
  await mkdir(".artifacts", { recursive: true });
  for (const theme of ["dark", "light"]) {
    if ((await root.getAttribute("data-theme")) !== theme)
      await root.locator('[data-action="theme"]').click();
    await root.locator('[data-action="fit"]').click();
    await page.screenshot({
      path: `.artifacts/sample-nejm-${theme}.png`,
      fullPage: true,
    });
    await root.screenshot({ path: `docs/screenshots/graph-${theme}.png` });
  }
  await root.locator(".accessible-graph summary").click();
  await root.locator('[data-edge="e21"]').first().click();
  await expect(root.locator(".paper-citation").first()).toContainText(
    "Baden LR",
  );
  await expect(root.locator(".paper-citation a").first()).toHaveAttribute(
    "href",
    "https://doi.org/10.1056/NEJMoa2035389",
  );
  await expect(root.locator(".evidence-location")).toContainText("PDF page 12");
  await root.locator(".evidence-content .source-jump").first().click();
  const preview = page.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await expect(preview.locator("h3")).toHaveText("NEJMoa2035389.pdf");
  await expect(preview.locator(".pdf-preview-location")).toContainText(
    "PDF page 12 of 14",
  );
  await expect(preview.locator(".pdf-preview-status")).toContainText(
    "highlighted",
  );
  await page.screenshot({
    path: ".artifacts/sample-nejm-citation-preview.png",
  });
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});
