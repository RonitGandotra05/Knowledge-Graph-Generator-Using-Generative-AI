import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { goFocus, goBuild, openHistory, menuClick } from "./helpers";
import { join, resolve } from "node:path";
const text =
  "Abstract\n\nAutism spectrum disorder (ASD) is associated with dysbiosis of the gut microbiome.\n\nMethods\n\nMachine learning identifies important microbial biomarkers related to ASD.\n\nResults\n\nSutterella and Prevotella are significant microbial biomarkers. Gut microbiome features were analyzed using machine learning.";
async function upload(page: Page) {
  await page.locator("#document-file").setInputFiles({
    name: "study.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
  await expect(page.locator("#document-summary")).toContainText(
    "Parsed locally",
  );
}
async function concepts(page: Page) {
  await goFocus(
    page,
    "Autism spectrum disorder, gut microbiome, Machine learning, biomarkers",
    "Explain microbiome associations and biomarkers in autism",
  );
  await goBuild(page);
}
async function mockAI(page: Page, mode: "good" | "bad" | "failure" = "good") {
  await page.route("https://api.openai.com/**", async (route) => {
    if (route.request().url().endsWith("/models"))
      return route.fulfill({ json: { data: [{ id: "test-model" }] } });
    if (mode === "failure")
      return route.fulfill({
        status: 429,
        json: { error: { message: "quota" } },
      });
    if (mode === "bad")
      return route.fulfill({
        json: { choices: [{ message: { content: "not JSON" } }] },
      });
    const body = route.request().postDataJSON();
    const prompt = body.messages[1].content as string;
    let result;
    if (
      body.response_format.json_schema.name === "research_extraction" &&
      body.response_format.json_schema.schema.properties.concepts
    )
      result = {
        concepts: [
          {
            label: "Autism spectrum disorder",
            type: "Condition",
            aliases: ["ASD"],
          },
          { label: "gut microbiome", type: "System", aliases: [] },
          { label: "Machine learning", type: "Method", aliases: [] },
          { label: "biomarkers", type: "Outcome", aliases: [] },
        ],
      };
    else {
      const match = [
        ...prompt.matchAll(/\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g),
      ].find((m) => m[2].includes("Autism spectrum disorder"));
      if (!match) throw new Error("Missing passage context");
      result = {
        nodes: [
          {
            id: "a",
            label: "Autism spectrum disorder",
            type: "Condition",
            aliases: ["ASD"],
          },
          { id: "b", label: "gut microbiome", type: "System", aliases: [] },
          { id: "c", label: "Machine learning", type: "Method", aliases: [] },
          { id: "d", label: "biomarkers", type: "Outcome", aliases: [] },
        ],
        edges: [
          {
            source: "a",
            target: "b",
            relationship: "associated_with",
            confidence: 0.9,
            evidence: match[2],
            passageId: match[1],
            kind: "stated",
            explanation: "The quoted study context connects these concepts.",
          },
        ],
      };
    }
    expect(route.request().headers().authorization).toBe("Bearer TEST-SECRET");
    expect(route.request().postData()).not.toContain("TEST-SECRET");
    await route.fulfill({
      json: { choices: [{ message: { content: JSON.stringify(result) } }] },
    });
  });
}
test("complete workflow, evidence, exports, history, keys, layouts, and themes", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockAI(page);
  await page.goto("/#workspace");
  await upload(page);
  await concepts(page);
  await page.locator("#api-key").fill("TEST-SECRET");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("evidence-atlas-key:"),
      ),
    ),
  ).toEqual([]);
  await expect(page.locator("#remember-key")).toHaveCount(0);
  await page.locator("#key-info").hover();
  await expect(page.locator("#key-privacy")).toBeVisible();
  await expect(page.locator("#key-privacy")).toContainText(
    "No browser storage",
  );
  await page.locator("#reveal-key").click();
  await expect(page.locator("#api-key")).toHaveAttribute("type", "text");
  await page.locator("#reveal-key").click();
  if ((await page.locator(".connection-options").getAttribute("open")) === null)
    await page.locator(".connection-options summary").click();
  await page.locator("#check-key").click();
  await expect(page.locator("#status")).toContainText("Key accepted");
  await page.locator(".send-preview > summary").click();
  await page.locator("#context-preview").click();
  await expect(page.locator("#selected-passages")).toContainText(
    "Autism spectrum disorder",
  );
  await page.locator("#analyze").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  await page.locator("#graph-root .accessible-graph summary").click();
  await page.locator("#graph-root [data-edge]").first().click();
  await expect(page.locator("#graph-root blockquote")).toContainText(
    "Autism spectrum disorder",
  );
  await expect(page.locator("#graph-root .evidence-content")).toContainText(
    "Paragraph",
  );
  await page.locator("#graph-root [data-node]").first().click();
  await expect(page.locator("#graph-root .relationship-card")).toHaveCount(1);
  for (const layout of ["circle", "breadthfirst", "concentric", "grid", "cose"])
    await page
      .locator('#graph-root select[aria-label="Graph layout"]')
      .selectOption(layout);
  await page
    .locator('#graph-root [aria-label="Search graph nodes"]')
    .fill("microbiome");
  await page.locator('#graph-root [data-action="reset"]').click();
  await page.locator('#graph-root input[data-type="System"]').uncheck();
  await expect(page.locator("#graph-root .graph-count")).toContainText(
    "0 relationships",
  );
  await page.locator('#graph-root [data-action="reset"]').click();
  await menuClick(page, "#theme-toggle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#graph-root")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await menuClick(page, "#theme-toggle");
  await page.locator("#save-analysis").click();
  await expect(page.locator("#history-items .history-card")).toHaveCount(1);
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const jsonFile = await jsonDownload;
  const json = JSON.parse(await readFile((await jsonFile.path())!, "utf8"));
  expect(JSON.stringify(json)).not.toContain("TEST-SECRET");
  expect(json.graph.edges).toHaveLength(1);
  const htmlDownload = page.waitForEvent("download");
  await page.locator("#export-html").click();
  const html = await htmlDownload;
  await mkdir(".artifacts", { recursive: true });
  const exportPath = join(process.cwd(), ".artifacts/test-graph.html");
  await html.saveAs(exportPath);
  const exported = await readFile(exportPath, "utf8");
  expect(exported).not.toContain("TEST-SECRET");
  expect(exported).toContain("connect-src 'none'");
  const offline = await context.newPage();
  const requests: string[] = [];
  offline.on("request", (r) => {
    if (r.url().startsWith("http")) requests.push(r.url());
  });
  await offline.goto("file://" + exportPath);
  await expect(offline.locator(".graph-count")).toContainText("4 concepts");
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-edge]").first().click();
  await expect(offline.locator("blockquote")).toContainText(
    "Autism spectrum disorder",
  );
  await offline.locator('[aria-label="Search graph nodes"]').fill("Autism");
  expect(requests).toEqual([]);
  await offline.close();
  await page.locator("#graph-root .graph-export summary").click();
  for (const format of ["svg", "png"]) {
    const event = page.waitForEvent("download");
    await page.locator(`#graph-root [data-action="${format}"]`).click();
    const file = await event;
    expect((await readFile((await file.path())!)).length).toBeGreaterThan(100);
  }
  await page.reload();
  await expect(page.locator("#api-key")).toHaveValue("");
  await expect(page.locator("#history-items .history-card")).toHaveCount(1);
  await openHistory(page);
  await page.locator("#history-items [data-open]").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  await page.locator("#import-file").setInputFiles({
    name: "analysis.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...json, key: "LEAK-ME" })),
  });
  await expect(page.locator("#status")).toContainText("Analysis imported");
  await page.locator("#save-analysis").click();
  await expect(page.locator("#history-items .history-card")).toHaveCount(2);
  await openHistory(page);
  await page.locator("#history-items [data-delete]").first().click();
  await expect(page.locator("#history-items .history-card")).toHaveCount(1);
  await page.locator("#clear-history").click();
  await page.locator("#confirm-delete").click();
  await expect(page.locator("#history-items .history-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("AI discovery, hybrid review, malformed responses, and provider failures", async ({
  page,
}) => {
  await mockAI(page);
  await page.goto("/#workspace");
  await upload(page);
  await concepts(page);
  await page.locator("#api-key").fill("TEST-SECRET");
  await goBuild(page);
  await page.locator("#discovery-controls summary").click();
  await page.locator("#discover-concepts").click();
  await page.locator(".concept-review summary").click();
  await expect(page.locator("#concept-count")).toContainText("selected");
  await page.locator("#select-none").click();
  await expect(page.locator("#concept-count")).toContainText("0 /");
  await page.locator("#select-all").click();
  await page.locator("#concept-search").fill("Method");
  await expect(page.locator(".concept-chip")).toHaveCount(1);
  await page.locator("#concept-search").fill("");
  await goBuild(page);
  await page.unroute("https://api.openai.com/**");
  await mockAI(page, "bad");
  await page.locator("#analyze").click();
  await expect(page.locator("#status")).toContainText("malformed JSON");
  await expect(page.locator("#analyze")).toBeEnabled();
  await page.unroute("https://api.openai.com/**");
  await mockAI(page, "failure");
  await page.locator("#resume-run").click();
  await expect(page.locator("#status")).toContainText("quota");
});
test("invalid files and responsive demo", async ({ page }) => {
  await page.goto("/#workspace");
  await page.locator("#document-file").setInputFiles({
    name: "corrupt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("bad pdf"),
  });
  await expect(page.locator("#status")).toContainText("not a valid PDF");
  await page.locator("#document-file").setInputFiles({
    name: "script.html",
    mimeType: "text/html",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await expect(page.locator("#status")).toContainText("Unsupported");
  await page.reload();
  await menuClick(page, "#explore-demo");
  await expect(page.locator("#demo-graph .graph-count")).toContainText(
    "9 concepts",
  );
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/dark-desktop.png",
    fullPage: true,
  });
  await menuClick(page, "#theme-toggle");
  await page.screenshot({
    path: "docs/screenshots/light-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await menuClick(page, '[data-info="privacy"]');
  await expect(page.locator("#info-dialog")).toBeVisible();
  await expect(page.locator("#info-dialog")).toContainText(
    "directly to your selected AI provider",
  );
});
test("PDF text extraction and DOCX parsing", async ({ page }) => {
  await page.goto("/#workspace");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage();
  p.drawText(
    "Abstract\nAutism spectrum disorder is associated with the gut microbiome.",
    { x: 50, y: 700, size: 13, font },
  );
  await page.locator("#document-file").setInputFiles({
    name: "text.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator("#document-summary")).toContainText("1 pages");
  await concepts(page);
  await expect(page.locator("#context-estimate")).not.toContainText("—");
  const { Document, Packer, Paragraph } = await import("docx");
  const buffer = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph(
              "Autism spectrum disorder is associated with the gut microbiome.",
            ),
          ],
        },
      ],
    }),
  );
  await goBuild(page);
  await page.locator("#document-file").setInputFiles({
    name: "study.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
  await expect(page.locator("#document-summary")).toContainText("study.docx");
  await expect(page.locator("#document-summary")).toContainText(
    "paragraph references",
  );
});

test("graph canvas zoom, drag, confidence, and fullscreen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#workspace");
  await menuClick(page, "#explore-demo");
  const canvas = page.locator("#demo-graph .graph-canvas");
  await expect(page.locator("#demo-graph .graph-count")).toContainText(
    "9 concepts",
  );
  await canvas.scrollIntoViewIfNeeded();
  // The renderer ignores wheel events for 250 ms after a page scroll.
  await page.waitForTimeout(300);
  const state = () =>
    canvas.evaluate((el) => {
      const cy = (
        el as HTMLElement & { _cyreg: { cy: import("cytoscape").Core } }
      )._cyreg.cy;
      const node = cy.nodes().first();
      return {
        zoom: cy.zoom(),
        position: node.position(),
        rendered: node.renderedPosition(),
        width: cy.width(),
      };
    });
  const before = await state(),
    bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await state()).zoom).not.toBe(before.zoom);
  const current = await state();
  await page.mouse.move(
    bounds.x + current.rendered.x,
    bounds.y + current.rendered.y,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + current.rendered.x + 60,
    bounds.y + current.rendered.y + 30,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => Math.abs((await state()).position.x - current.position.x))
    .toBeGreaterThan(10);
  const slider = page.locator('#demo-graph [aria-label="Minimum confidence"]');
  await slider.fill("95");
  await expect(page.locator("#demo-graph .graph-count")).toContainText(
    "0 relationships",
  );
  await page.locator('#demo-graph [data-action="reset"]').click();
  await expect(page.locator("#demo-graph .graph-count")).toContainText(
    "8 relationships",
  );
  await page.locator('#demo-graph [data-action="fullscreen"]').click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.locator('#demo-graph [data-action="fullscreen"]').click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});
test("untrusted import labels and script content remain inert in offline HTML", async ({
  page,
  context,
}) => {
  await page.goto("/#workspace");
  const label = "</script><script>window.INJECTED=true</script>";
  const analysis = {
    version: 1,
    name: label,
    documentName: "untrusted.json",
    graph: {
      nodes: [
        { id: "n1", label, type: "Concept", aliases: [] },
        { id: "n2", label: "Research", type: "Concept", aliases: [] },
      ],
      edges: [
        {
          source: "n1",
          target: "n2",
          relationship: "mentions",
          confidence: 0.8,
          evidence: "Literal research passage with enough evidence.",
          passageId: "p1",
          page: 1,
          section: "Abstract",
          kind: "stated",
          explanation: label,
        },
      ],
    },
    concepts: [],
    settings: { layout: "circle", theme: "dark" },
    stats: {},
    key: "NEVER-EXPORT",
  };
  await page.locator("#import-file").setInputFiles({
    name: "untrusted.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(analysis)),
  });
  await expect(page.locator("#status")).toContainText("Analysis imported");
  expect(await page.evaluate(() => "INJECTED" in window)).toBe(false);
  const pending = page.waitForEvent("download");
  await page.locator("#export-html").click();
  const file = await pending;
  const content = await readFile((await file.path())!, "utf8");
  expect(content).not.toContain("NEVER-EXPORT");
  const offline = await context.newPage();
  const output = join(process.cwd(), ".artifacts/security-test.html");
  await file.saveAs(output);
  await offline.goto("file://" + output);
  expect(await offline.evaluate(() => "INJECTED" in window)).toBe(false);
  await expect(offline.locator("h1")).toHaveText(label);
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-edge]").first().click();
  await offline.locator('[data-action="edit-edge"]').click();
  await offline
    .locator('[name="explanation"]')
    .fill("</script><script>window.REINJECTED=true</script>\u2028");
  await offline
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  const editedDownload = offline.waitForEvent("download");
  await offline.locator("#html").click();
  const edited = await editedDownload;
  const editedPath = join(process.cwd(), ".artifacts/security-edited.html");
  await edited.saveAs(editedPath);
  await offline.goto("file://" + editedPath);
  expect(
    await offline.evaluate(
      () => "REINJECTED" in window || "INJECTED" in window,
    ),
  ).toBe(false);
  await expect(offline.locator(".graph-count")).toContainText("2 concepts");
  await offline.close();
});

test("uploaded research paper: OCR, matching, provenance, and context reduction", async ({
  page,
}) => {
  test.skip(
    !process.env.PAPER_PATH,
    "Set PAPER_PATH to test an external PDF without committing it.",
  );
  test.setTimeout(600000);
  page.on("pageerror", (e) => console.log("OCR browser error:", e.message));
  page.on("requestfailed", (r) =>
    console.log("OCR request failed:", r.url(), r.failure()?.errorText),
  );
  await page.goto("/#workspace");
  await page.locator("#document-file").setInputFiles(process.env.PAPER_PATH!);
  await expect(page.locator("#document-summary")).toContainText("14 pages", {
    timeout: 550000,
  });
  await expect(page.locator("#document-summary")).toContainText(
    "automatic OCR on 14 page(s)",
  );
  await goFocus(
    page,
    "Autism, gut microbiome, Sutterella, Prevotella, machine learning, acrA",
  );
  await goBuild(page);
  await expect(page.locator("#context-note")).toContainText(
    "All parsed sections",
  );
  await expect(page.locator("#context-estimate")).not.toContainText("—");
  await goBuild(page);
  await page.locator("#text-preview").click();
  await expect(page.locator("#extracted-text")).toContainText("Autism");
  const download = page.waitForEvent("download");
  await page.locator("#export-text").click();
  await (await download).saveAs(".artifacts/paper-extracted.txt");
  await page.screenshot({
    path: ".artifacts/paper-workflow.png",
    fullPage: true,
  });
  await mkdir(".artifacts", { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    ".artifacts/paper-validation.json",
    JSON.stringify(
      {
        summary: await page.locator("#document-summary").innerText(),
        context: await page.locator("#context-note").textContent(),
        estimate: await page.locator("#context-estimate").textContent(),
        concepts: await page.locator("#concept-count").textContent(),
      },
      null,
      2,
    ),
  );
  await page.route("https://api.openai.com/**", async (route) => {
    const body = route.request().postDataJSON();
    const prompt = body.messages[1].content as string;
    const blocks = [
      ...prompt.matchAll(
        /\[([^\]]+)\] Page: ([^\n]+)\n([\s\S]*?)(?=\n\n\[[^\]]+\] Page:|$)/g,
      ),
    ];
    const passage =
      blocks.find((m) =>
        m[3].includes("possible connection between dysbiosis"),
      ) || blocks.find((m) => m[3].toLowerCase().includes("gut microbiome"));

    if (body.response_format.json_schema.schema.properties.concepts)
      return route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  concepts: [
                    { label: "Autism", type: "Condition", aliases: [] },
                    { label: "gut microbiome", type: "System", aliases: [] },
                  ],
                }),
              },
            },
          ],
        },
      });
    const result = {
      nodes: [
        { id: "autism", label: "Autism", type: "Condition", aliases: [] },
        {
          id: "microbiome",
          label: "gut microbiome",
          type: "System",
          aliases: [],
        },
      ],
      edges:
        passage && /autism/i.test(passage[3])
          ? [
              {
                source: "microbiome",
                target: "autism",
                relationship: "possibly_associated_with",
                confidence: 0.8,
                evidence: passage[3].trim(),
                passageId: passage[1],
                kind: "implied",
                explanation:
                  "Test-double relationship used to exercise provenance and exports, not a live scientific AI analysis.",
              },
            ]
          : [],
    };
    await route.fulfill({
      json: { choices: [{ message: { content: JSON.stringify(result) } }] },
    });
  });
  await goBuild(page);
  await page.locator("#api-key").fill("PAPER-TEST-KEY");
  await page.locator("#analyze").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  await page.locator("#graph-root .accessible-graph summary").click();
  await page.locator("#graph-root [data-edge]").first().click();
  await expect(page.locator("#graph-root .evidence-location")).toContainText(
    "PDF page",
  );
  await expect(page.locator("#graph-root .evidence-location")).toContainText(
    "05v1.pdf",
  );
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const { readFile } = await import("node:fs/promises");
  const analysis = JSON.parse(
    await readFile((await (await jsonDownload).path())!, "utf8"),
  );
  const normalize = (text: string) =>
    text.normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
  for (const edge of analysis.graph.edges) {
    const source = analysis.sources.find((p: any) => p.id === edge.passageId);
    expect(source).toBeDefined();
    expect(normalize(source.text)).toContain(normalize(edge.evidence));
    expect(edge.paperName).toBe("05v1.pdf");
    expect(edge.paperId).toBe(source.paperId);
    expect(edge.page).toBe(source.page);
    expect(edge.paragraph).toBe(source.paragraph);
  }
  expect(analysis.graph.nodes.every((n: any) => n.sources?.length)).toBe(true);
  const savedSource = analysis.sources.find(
    (p: any) => p.id === analysis.graph.edges[0].passageId,
  );
  expect(savedSource.pdfLines.length).toBeGreaterThan(0);
  await page.locator("#graph-root [data-edge]").first().click();
  await page
    .locator("#graph-root .evidence-content .source-jump")
    .first()
    .click();
  const pdfPreview = page.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await expect(pdfPreview.locator(".pdf-preview-status")).toContainText(
    "highlighted",
  );
  await expect(pdfPreview.locator(".pdf-preview-location")).toContainText(
    "PDF page 1 of 14",
  );
  await page.screenshot({ path: ".artifacts/pdf-preview-uploaded-paper.png" });
  await pdfPreview.getByRole("button", { name: "Close PDF preview" }).click();
  const html = page.waitForEvent("download");
  await page.locator("#export-html").click();
  await (await html).saveAs(".artifacts/paper-test-graph.html");
  const offline = await page.context().newPage();
  await offline.setViewportSize({ width: 1280, height: 720 });
  await offline.goto("file://" + resolve(".artifacts/paper-test-graph.html"));
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-edge]").first().click();
  await expect(offline.locator(".evidence-location")).toContainText("05v1.pdf");
  await expect(offline.locator("blockquote")).toHaveText(
    analysis.graph.edges[0].evidence,
  );
  await offline.locator(".source-passage summary").click();
  await expect(offline.locator(".source-text mark")).toHaveText(
    analysis.graph.edges[0].evidence,
  );
  const panel = await offline.locator(".evidence-panel").boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(0);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(720);
  await expect(
    offline.getByRole("button", { name: "Close evidence", exact: true }),
  ).toBeInViewport();
  await offline.locator(".evidence-content .source-jump").first().click();
  const offlinePreview = offline.getByRole("dialog", {
    name: "Source PDF preview",
    exact: true,
  });
  await offlinePreview
    .locator("input[type=file]")
    .setInputFiles(process.env.PAPER_PATH!);
  await expect(offlinePreview.locator(".pdf-preview-status")).toContainText(
    "highlighted",
  );
  await offline.screenshot({
    path: ".artifacts/pdf-preview-generated-offline.png",
  });
  expect(offline.url()).toBe(
    "file://" + resolve(".artifacts/paper-test-graph.html"),
  );
});
