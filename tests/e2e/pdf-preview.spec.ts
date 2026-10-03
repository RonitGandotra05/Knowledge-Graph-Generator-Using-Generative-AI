import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("record source page geometry for the supplied scanned sample", async ({
  page,
}) => {
  test.skip(
    process.env.RECORD_SAMPLE_GEOMETRY !== "1",
    "Geometry is a checked-in sample fixture; regenerate explicitly.",
  );
  test.setTimeout(120000);
  await page.goto("/#sample");
  const result = await page.evaluate(async () => {
    const pdfjsPath = "/node_modules/pdfjs-dist/build/pdf.mjs",
      ocrPath = "/src/documents/ocr.ts";
    const pdfjs = await import(/* @vite-ignore */ pdfjsPath);
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const bytes = await (await fetch("/samples/05v1.pdf")).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const fingerprint = Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const { ocrPDF } = await import(/* @vite-ignore */ ocrPath);
    let lines: unknown[] = [];
    await ocrPDF(
      await task.promise,
      () => {},
      [1],
      (_: number, __: string, value: unknown[]) => {
        lines = value;
      },
    );
    await task.destroy();
    return { fingerprint, lines };
  });
  expect(result.lines.length).toBeGreaterThan(30);
  await mkdir(".artifacts", { recursive: true });
  await writeFile(
    ".artifacts/sample-pdf-geometry.json",
    JSON.stringify(result, null, 2),
  );
});

async function expectPreviewContained(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".pdf-preview-status")).toContainText(
    "highlighted",
  );
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  await expect(
    dialog.getByRole("button", { name: "Close PDF preview" }),
  ).toBeInViewport();
  const first = await dialog.locator(".pdf-highlight").first().boundingBox();
  const scroll = await dialog.locator(".pdf-preview-scroll").boundingBox();
  expect(first!.y).toBeGreaterThanOrEqual(scroll!.y);
  expect(first!.y + first!.height).toBeLessThanOrEqual(
    scroll!.y + scroll!.height,
  );
  expect(
    await dialog
      .locator("canvas")
      .evaluate((el) => (el as HTMLCanvasElement).width),
  ).toBeGreaterThan(200);
  return dialog;
}

test("sample opens the scanned PDF at highlighted lines in a compact same-tab popup in both themes and mobile", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/#sample");
  const url = page.url();
  const root = page.locator("#demo-graph");
  await root.locator(".accessible-graph summary").click();
  await root.locator('[data-edge="e2"]').first().click();
  for (const theme of ["dark", "light"]) {
    if ((await root.getAttribute("data-theme")) !== theme)
      await root.locator('[data-action="theme"]').click();
    await root.locator(".evidence-content .source-jump").first().click();
    const dialog = await expectPreviewContained(page);
    await expect(dialog.locator("h3")).toHaveText("05v1.pdf");
    await expect(dialog.locator(".pdf-preview-location")).toContainText(
      "PDF page 1 of 14",
    );
    await expect(dialog.locator(".pdf-highlight")).toHaveCount(2);
    expect(page.url()).toBe(url);
    expect(context.pages()).toHaveLength(1);
    const scroll = dialog.locator(".pdf-preview-scroll");
    const beforePan = await scroll.evaluate((el) => el.scrollLeft);
    const area = await scroll.boundingBox();
    await page.mouse.move(area!.x + 220, area!.y + 180);
    await page.mouse.down();
    await page.mouse.move(area!.x + 160, area!.y + 180);
    await page.mouse.up();
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(
      beforePan,
    );
    const zoom = dialog.locator("output");
    await expect(zoom).toHaveText("200%");
    await dialog.getByRole("button", { name: "Zoom PDF in" }).click();
    await expect(zoom).toHaveText("250%");
    await dialog.getByRole("button", { name: "Fit width" }).click();
    await expect(zoom).toHaveText("100%");
    await dialog.getByRole("button", { name: "Zoom PDF in" }).click();
    await expect(zoom).toHaveText("150%");
    await page.screenshot({
      path: `.artifacts/pdf-preview-sample-${theme}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(root.locator(".evidence-panel")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await root.locator(".evidence-content .source-jump").first().click();
  const mobile = await expectPreviewContained(page);
  await page.screenshot({ path: ".artifacts/pdf-preview-sample-mobile.png" });
  await mobile.getByRole("button", { name: "Close PDF preview" }).click();
  await expect(root.locator(".evidence-panel")).toBeVisible();
  expect(page.url()).toBe(url);
  expect(context.pages()).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("uploaded multi-paper preview selects the correct paper and page, validates reattached files, and works in offline HTML", async ({
  page,
  context,
}) => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { goFocus, openHistory } = await import("./helpers");
  const { resolve } = await import("node:path");
  const quote = "Alpha improves Beta in the treatment group.";
  async function makePDF(lines: string[]) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const text of lines)
      pdf.addPage().drawText(text, { x: 45, y: 450, font, size: 14 });
    return Buffer.from(await pdf.save());
  }
  const first = {
    name: "first-source.pdf",
    mimeType: "application/pdf",
    buffer: await makePDF([
      "Alpha uses Beta in the control group.",
      "Alpha and Beta are reported as control measurements.",
    ]),
  };
  const second = {
    name: "second-source.pdf",
    mimeType: "application/pdf",
    buffer: await makePDF([
      "Alpha and Beta are tested using study measurements.",
      quote,
    ]),
  };
  await page.route("https://api.openai.com/**", async (route) => {
    const body = route.request().postDataJSON();
    const concepts = ["Alpha", "Beta"].map((label) => ({
      label,
      type: "Concept",
      aliases: [],
    }));
    const passage = [
      ...body.messages[1].content.matchAll(
        /\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g,
      ),
    ].find((m) => m[2].includes(quote));
    const result = body.response_format.json_schema.schema.properties.concepts
      ? { concepts }
      : {
          nodes: concepts.map((c, i) => ({ ...c, id: "n" + i })),
          edges: passage
            ? [
                {
                  source: "n0",
                  target: "n1",
                  relationship: "improves",
                  confidence: 0.8,
                  evidence: quote,
                  passageId: passage[1],
                  kind: "stated",
                  explanation: "Test double with a real PDF source.",
                },
              ]
            : [],
        };
    await route.fulfill({
      json: { choices: [{ message: { content: JSON.stringify(result) } }] },
    });
  });
  await page.goto("/#workspace");
  await page.locator("#document-file").setInputFiles([first, second]);
  await expect(page.locator("#status")).toContainText("2 papers ready");
  await goFocus(page, "Alpha, Beta");
  await page.locator("#api-key").fill("PREVIEW-TEST-KEY");
  await page.locator("#analyze").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  const root = page.locator("#graph-root");
  async function openJump() {
    await root.locator(".accessible-graph summary").click();
    await root.locator("[data-edge]").first().click();
    await root.locator(".evidence-content .source-jump").first().click();
  }
  await openJump();
  let dialog = await expectPreviewContained(page);
  await expect(dialog.locator("h3")).toHaveText("second-source.pdf");
  await expect(dialog.locator(".pdf-preview-location")).toContainText(
    "PDF page 2 of 2",
  );
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Close PDF preview" }).click();
  await page.locator("#export-html").click();
  const path = resolve(".artifacts/pdf-preview-offline.html");
  await (await download).saveAs(path);

  await page.reload();
  await openHistory(page);
  await page.locator("[data-open]").first().click();
  await openJump();
  dialog = page.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await expect(dialog.locator(".pdf-preview-status")).toContainText(
    "Choose the original PDF",
  );
  await dialog.locator("input[type=file]").setInputFiles({
    name: second.name,
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await expect(dialog.locator(".pdf-preview-status")).toContainText(
    "not a valid PDF",
  );
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ ...first, name: second.name });
  await expect(dialog.locator(".pdf-preview-status")).toContainText(
    "different PDF",
  );
  await dialog.locator("input[type=file]").setInputFiles(second);
  await expectPreviewContained(page);
  await dialog.getByRole("button", { name: "Close PDF preview" }).click();

  const offline = await context.newPage();
  await offline.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [],
    remote: string[] = [];
  offline.on("pageerror", (e) => errors.push(e.message));
  offline.on("request", (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await offline.goto("file://" + path);
  const url = offline.url();
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-edge]").first().click();
  await offline.locator(".evidence-content .source-jump").first().click();
  const popup = offline.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await popup.locator("input[type=file]").setInputFiles(second);
  await expectPreviewContained(offline);
  await expect(popup.locator(".pdf-preview-location")).toContainText(
    "PDF page 2 of 2",
  );
  await offline.screenshot({ path: ".artifacts/pdf-preview-offline.png" });
  expect(offline.url()).toBe(url);
  expect(context.pages()).toHaveLength(2);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});
