import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile, mkdir } from "node:fs/promises";
import { goFocus, goBuild, openHistory } from "./helpers";
async function pdf(name: string, text: string) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    p = doc.addPage();
  p.drawText(text, { x: 40, y: 740, font, size: 12 });
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  };
}
async function exported(page: Page) {
  const pending = page.waitForEvent("download");
  await page.locator("#export-json").click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}
test("ten PDFs stream source-grounded nodes/edges, count actual usage, and preserve all paper evidence offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let relations = 0,
    release = () => {},
    held = false;
  const contexts: string[] = [];
  await page.route("https://api.openai.com/**", async (route) => {
    const body = route.request().postDataJSON(),
      prompt = body.messages[1].content as string;
    expect(route.request().headers().authorization).toBe(
      "Bearer MULTI-TEST-SECRET",
    );
    contexts.push(prompt);
    const discovery =
      !!body.response_format.json_schema.schema.properties.concepts;
    let result;
    if (discovery)
      result = {
        concepts: [
          { label: "Alpha", type: "Concept", aliases: [] },
          { label: "Beta", type: "Concept", aliases: [] },
        ],
      };
    else {
      relations++;
      if (relations === 2) {
        held = true;
        await new Promise<void>((resolve) => (release = resolve));
      }
      const supplied = JSON.parse(
        prompt.slice(0, prompt.indexOf("\n[")),
      ).concepts;
      const source = supplied.find((n: any) => n.label === "Alpha"),
        target = supplied.find((n: any) => n.label === "Beta");
      const m = [
        ...prompt.matchAll(/\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g),
      ].find((m) => m[2].includes("Alpha"))!;
      result = {
        edges: [
          {
            source: source.id,
            target: target.id,
            relationship: "associated_with",
            confidence: 0.8,
            evidence: m[2],
            passageId: m[1],
            kind: "stated",
            explanation: "Test double, not a scientific evaluation.",
          },
        ],
      };
    }
    await route.fulfill({
      json: {
        usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(result) },
          },
        ],
      },
    });
  });
  await page.goto("/#workspace");
  const files = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      pdf(
        `study-${i + 1}.pdf`,
        `Alpha is associated with Beta in StudyMarker${i + 1} research findings.`,
      ),
    ),
  );
  await page.locator("#document-file").setInputFiles(files);
  await expect(page.locator(".paper-row.ready")).toHaveCount(10);
  await expect(page.locator("#status")).toContainText("10 papers ready");
  await expect(page.locator("#use-ocr")).toHaveCount(0);
  await goFocus(page, "Alpha, Beta");
  await goBuild(page);
  await expect(page.locator("#run-estimate")).toContainText("20");
  await expect(page.locator("#run-estimate")).toContainText(
    "Evidence Atlas charges $0",
  );
  await page.locator("#api-key").fill("MULTI-TEST-SECRET");
  await page.locator("#analyze").click();
  await expect.poll(() => held).toBe(true);
  await expect(page.locator("#graph-root .graph-count")).toContainText(
    "1 relationships",
  );
  await expect(page.locator("#run-badge")).toHaveText("LIVE ANALYSIS");
  const partial = Number(
    await page.locator("#run-progress-bar").getAttribute("value"),
  );
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(100);
  await expect(page.locator("#graph-root")).toHaveClass(/is-building/);
  await mkdir(".artifacts/multi-paper", { recursive: true });
  await page.screenshot({
    path: ".artifacts/multi-paper/live-desktop.png",
    fullPage: true,
  });
  release();
  await expect(page.locator("#status")).toContainText("Graph ready:");
  await expect(page.locator("#run-percent")).toHaveText("100%");
  await expect(page.locator("#analysis-usage")).toContainText(
    "5,600 reported tokens",
  );
  const json = await exported(page);
  expect(json.graph.edges).toHaveLength(10);
  expect(new Set(json.graph.edges.map((e: any) => e.paperName)).size).toBe(10);
  expect(json.graph.nodes.every((n: any) => n.sources.length === 10)).toBe(
    true,
  );
  expect(
    json.graph.edges.every((e: any) => e.page === 1 && e.paragraph === 1),
  ).toBe(true);
  expect(json.usage.calls).toBe(20);
  expect(json.usage.totalTokens).toBe(5600);
  expect(json.usage.unknownCalls).toBe(0);
  expect(json.usage.estimatedCostUSD).toBeCloseTo(0.00416);
  expect(JSON.stringify(json)).not.toContain("MULTI-TEST-SECRET");
  for (const file of files)
    expect(contexts.some((c) => c.includes(file.name))).toBe(true);
  await page.locator("#import-file").setInputFiles({
    name: "multi.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.locator("#analysis-meta")).toContainText(
    "10 relationships",
  );
  const htmlPromise = page.waitForEvent("download");
  await page.locator("#export-html").click();
  const html = await htmlPromise,
    offline = await context.newPage(),
    network: string[] = [];
  offline.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  await html.saveAs(".artifacts/multi-paper/ten-papers.html");
  const { resolve } = await import("node:path");
  await offline.goto(
    "file://" + resolve(".artifacts/multi-paper/ten-papers.html"),
  );
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-edge]").last().click();
  await expect(offline.locator(".source-passage summary")).toContainText(
    "study-10.pdf",
  );
  expect(network).toEqual([]);
  await offline.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await expect
    .poll(() =>
      page.locator("#graph-root .graph-canvas").evaluate((el) => {
        const cy = (el as any)._cyreg.cy;
        return cy
          .nodes()
          .toArray()
          .every((n: any) => {
            const b = n.renderedBoundingBox();
            return (
              b.x1 >= 0 &&
              b.y1 >= 0 &&
              b.x2 <= cy.width() &&
              b.y2 <= cy.height() &&
              Number(n.style("font-size").replace("px", "")) * cy.zoom() >= 12
            );
          });
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: ".artifacts/multi-paper/complete-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("failed PDFs are explicitly excluded, OCR runs automatically and eleven files leave existing work intact", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#workspace");
  const readable = await pdf(
    "readable.pdf",
    "Alpha is associated with Beta in readable research findings.",
  );
  const blank = await PDFDocument.create();
  blank.addPage();
  // Make OCR initialization fail deterministically. Native text survives; failed
  // image-only papers are excluded rather than accepted as successfully read.
  await page.route("**/eng.traineddata.gz", (route) => route.abort());
  await page.locator("#document-file").setInputFiles([
    readable,
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\ncorrupt"),
    },
    {
      name: "scan-unavailable.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await blank.save()),
    },
  ]);
  await expect(page.locator(".paper-row.failed")).toHaveCount(2, {
    timeout: 90000,
  });
  await expect(page.locator("#status")).toContainText("1 paper ready");
  await expect(page.locator("#document-summary")).toContainText("Excluded");
  await page.locator("#document-file").setInputFiles(
    Array.from({ length: 11 }, (_, i) => ({
      ...readable,
      name: `too-many-${i}.pdf`,
    })),
  );
  await expect(page.locator("#status")).toContainText("Choose up to 10");
  await expect(page.locator("#document-summary")).toContainText("readable.pdf");
  await expect(page.locator(".paper-row.ready")).toHaveCount(1);
  const mixed = await PDFDocument.create(),
    font = await mixed.embedFont(StandardFonts.Helvetica);
  mixed
    .addPage()
    .drawText("Alpha is associated with Beta in readable research results.", {
      x: 40,
      y: 740,
      font,
      size: 12,
    });
  mixed.addPage();
  await page.locator("#document-file").setInputFiles({
    name: "partly-readable.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await mixed.save()),
  });
  await expect(page.locator(".paper-row.partial")).toHaveCount(1, {
    timeout: 90000,
  });
  await expect(page.locator("#document-summary")).toContainText(
    "excluded pages 2",
  );
  await expect(page.locator("#status")).toContainText("1 paper ready");
});

test("paused discovery resumes remaining papers after New graph and refresh without storing credentials", async ({
  page,
}) => {
  let held = false,
    release = () => {},
    holdOnce = true;
  const discovered: string[] = [];
  await page.route("https://api.openai.com/**", async (route) => {
    const body = route.request().postDataJSON(),
      prompt = body.messages[1].content as string;
    const discovery =
      !!body.response_format.json_schema.schema.properties.concepts;
    let result;
    if (discovery) {
      const name = /Paper: "([^"]+)"/.exec(prompt)![1];
      discovered.push(name);
      if (discovered.length === 2 && holdOnce) {
        holdOnce = false;
        held = true;
        await new Promise<void>((resolve) => (release = resolve));
      }
      result = {
        concepts: [
          { label: "Alpha", type: "Concept", aliases: [] },
          { label: "Beta", type: "Concept", aliases: [] },
        ],
      };
    } else result = { edges: [] };
    try {
      await route.fulfill({
        json: {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
          },
          choices: [{ message: { content: JSON.stringify(result) } }],
        },
      });
    } catch {}
  });
  await page.goto("/#workspace");
  await page
    .locator("#document-file")
    .setInputFiles(
      await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          pdf(
            `resume-${i + 1}.pdf`,
            "Alpha and Beta are measured in a research study.",
          ),
        ),
      ),
    );
  await expect(page.locator(".paper-row.ready")).toHaveCount(3);
  await goFocus(page, "Alpha, Beta");
  await goBuild(page);
  await page.locator("#api-key").fill("RESUME-ONLY-MEMORY");
  await page.locator("#analyze").click();
  await expect.poll(() => held).toBe(true);
  await page.locator("#cancel-request").click();
  release();
  await expect(page.locator("#status")).toContainText("cancelled");
  await expect(page.locator("#resume-run")).toBeVisible();
  await page.locator("#new-analysis").click();
  await page.reload();
  await openHistory(page);
  await expect(page.locator(".history-card")).toContainText("Ongoing");
  await page.locator("[data-open]").first().click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await page.locator("#resume-run").click();
  await page.locator("#api-key").fill("RESUME-ONLY-MEMORY");
  await page.locator("#analyze").click();
  await expect(page.locator("#status")).toContainText("Graph ready:");
  expect(discovered.filter((n) => n === "resume-1.pdf")).toHaveLength(1);
  expect(discovered.filter((n) => n === "resume-2.pdf")).toHaveLength(2);
  expect(discovered.filter((n) => n === "resume-3.pdf")).toHaveLength(1);
  expect(JSON.stringify(await exported(page))).not.toContain(
    "RESUME-ONLY-MEMORY",
  );
});

test("ten actual research PDFs parse together with automatic OCR and retain filenames and original page indices", async ({
  page,
}) => {
  test.skip(
    process.env.ONLINE_PAPERS !== "1" || !process.env.PAPER_PATH,
    "Requires actual research paper fixtures.",
  );
  test.setTimeout(240000);
  const manifest = JSON.parse(
    await readFile("tests/fixtures/online-papers.json", "utf8"),
  );
  await page.goto("/#workspace");
  await page
    .locator("#document-file")
    .setInputFiles([
      ...manifest.map((p: any) => `.artifacts/online-papers/${p.id}.pdf`),
      process.env.PAPER_PATH!,
    ]);
  await expect(page.locator("#status")).toContainText("10 papers ready", {
    timeout: 200000,
  });
  await expect(page.locator(".paper-row")).toHaveCount(10);
  const collection = await page.evaluate(async () => {
    const path = "/src/storage/drafts.ts";
    const { drafts } = await import(path);
    await new Promise((r) => setTimeout(r, 400));
    return (await drafts.list())[0];
  });
  expect(collection.document.pages).toBe(287);
  expect(collection.document.papers).toHaveLength(10);
  expect(
    new Set(collection.document.passages.map((p: any) => p.paperId)).size,
  ).toBe(10);
  expect(
    collection.document.passages
      .filter((p: any) => p.paperName === "05v1.pdf")
      .every((p: any) => p.page >= 1 && p.page <= 14),
  ).toBe(true);
  expect(
    collection.document.papers.find((p: any) => p.name === "05v1.pdf").ocrPages
      .length,
  ).toBe(14);
  await goFocus(page, "microbiome, attention");
  await goBuild(page);
  await page.locator("#provider").selectOption("groq");
  await expect(page.locator("#run-estimate")).toContainText("quota windows");
  await page.locator("#billing-plan").selectOption("free");
  await expect(page.locator("#run-estimate")).toContainText(
    "Free tier selected",
  );
  await page.screenshot({
    path: ".artifacts/multi-paper/real-ten-papers-budget.png",
    fullPage: true,
  });
});
