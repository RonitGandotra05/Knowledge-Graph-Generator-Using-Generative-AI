import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, degrees } from "pdf-lib";
import type { ResearchDocument } from "../../src/types";
import type { ContextSelection } from "../../src/retrieval/context";
import { join } from "node:path";
const enabled = process.env.ONLINE_PAPERS === "1";
const folder = join(process.cwd(), ".artifacts/online-papers");
async function upload(page: Page, bytes: Uint8Array, name: string) {
  await page.goto("/#workspace");
  await page.evaluate(() => {
    document.querySelector("#variant-file")?.remove();
    const input = document.createElement("input");
    input.type = "file";
    input.id = "variant-file";
    document.body.append(input);
  });
  await page.locator("#variant-file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
}
async function parse(page: Page, ocr = false) {
  return page.evaluate(async (ocr): Promise<ResearchDocument> => {
    const path = "/src/documents/parser.ts";
    const { parseDocument } = await import(path);
    return parseDocument(
      (document.querySelector("#variant-file") as HTMLInputElement).files![0],
      () => {},
      ocr,
    );
  }, ocr);
}

test("real-paper variant: mixed text/scanned pages, rotation, and per-page OCR", async ({
  page,
}) => {
  test.skip(!enabled, "Requires the public paper corpus.");
  test.setTimeout(180000);
  const source = await readFile(join(folder, "attention.pdf"));
  await upload(page, source, "attention.pdf");
  const png = await page.evaluate(async () => {
    const path = "/node_modules/pdfjs-dist/build/pdf.mjs";
    const pdfjs = await import(path);
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const file = (document.querySelector("#variant-file") as HTMLInputElement)
      .files![0];
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    try {
      const pdf = await task.promise,
        page = await pdf.getPage(2),
        viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      return canvas.toDataURL("image/png").split(",")[1];
    } finally {
      await task.destroy();
    }
  });
  const original = await PDFDocument.load(source),
    mixed = await PDFDocument.create();
  const [first, last] = await mixed.copyPages(original, [0, 14]);
  mixed.addPage(first);
  const image = await mixed.embedPng(Buffer.from(png, "base64"));
  const scanned = mixed.addPage([first.getWidth(), first.getHeight()]);
  scanned.drawImage(image, {
    x: 0,
    y: 0,
    width: first.getWidth(),
    height: first.getHeight(),
  });
  last.setRotation(degrees(90));
  mixed.addPage(last);
  const bytes = await mixed.save();
  await mkdir(join(folder, "results"), { recursive: true });
  await writeFile(join(folder, "results", "mixed-paper.pdf"), bytes);
  await upload(page, bytes, "attention-mixed-rotated.pdf");
  const without = await parse(page);
  expect(without.pages).toBe(3);
  expect(without.passages.some((p) => p.page === 2)).toBe(false);
  expect(without.warnings.join(" ")).toContain(
    "PDF page(s) 2 have little extractable text",
  );
  expect(
    without.passages.some((p) => p.page === 3 && /attention/i.test(p.text)),
  ).toBe(true);
  const withOCR = await parse(page, true);
  expect(withOCR.pages).toBe(3);
  expect(withOCR.warnings.join(" ")).toContain("OCR was applied to 1 page(s)");
  expect(
    withOCR.passages
      .filter((p) => p.page === 2)
      .map((p) => p.text)
      .join(" ")
      .toLowerCase(),
  ).toContain("recurrent");
  for (const index of [1, 3])
    expect(
      withOCR.passages.filter((p) => p.page === index).map((p) => p.text),
    ).toEqual(
      without.passages.filter((p) => p.page === index).map((p) => p.text),
    );
  await mkdir(join(folder, "results"), { recursive: true });
  await writeFile(
    join(folder, "results", "mixed-page-variant.json"),
    JSON.stringify(
      {
        pages: withOCR.pages,
        textLayerCharacters: without.characters,
        recoveredCharacters: withOCR.characters - without.characters,
        warningsBefore: without.warnings,
        warningsAfter: withOCR.warnings,
        source:
          "attention.pdf pages 1, 2 (rasterized), 15 (rotated 90 degrees)",
      },
      null,
      2,
    ),
  );
  console.log(
    "Mixed/rotated actual paper: scanned page recovered; existing text pages unchanged.",
  );
});

test("real-paper stress variant: combined corpus, document bounds, and corrupt input", async ({
  page,
}) => {
  test.skip(!enabled, "Requires the public paper corpus.");
  test.setTimeout(120000);
  const papers = JSON.parse(
    await readFile("tests/fixtures/online-papers.json", "utf8"),
  );
  const combined = await PDFDocument.create();
  for (const paper of papers) {
    const pdf = await PDFDocument.load(
      await readFile(join(folder, paper.id + ".pdf")),
    );
    for (const copied of await combined.copyPages(pdf, pdf.getPageIndices()))
      combined.addPage(copied);
  }
  const bytes = await combined.save();
  expect(bytes.length).toBeLessThan(30 * 1024 * 1024);
  await upload(page, bytes, "combined-public-corpus.pdf");
  const doc = await parse(page);
  expect(doc.pages).toBe(273);
  // The long review's final PDF page has no extractable text. Page indices
  // must keep their original offsets, including this textless page.
  expect(new Set(doc.passages.map((p) => p.page)).size).toBe(272);
  expect(doc.warnings.join(" ")).toContain(
    "PDF page(s) 273 have little extractable text",
  );
  const selection = await page.evaluate(async (doc) => {
    const path = "/src/retrieval/context.ts";
    const { selectContext, parseTerms, formatContext } = await import(path);
    const result: ContextSelection = selectContext(
      doc,
      parseTerms("Transformer, GW150914, Archaea, MaxEnt, Gaussian"),
      1000,
    );
    return {
      ...result,
      serializedCharacters: formatContext(result.passages).length,
    };
  }, doc);
  expect(selection.missing).toEqual([]);
  expect(selection.characters).toBeLessThanOrEqual(4000);
  expect(selection.serializedCharacters).toBeLessThanOrEqual(4000);
  expect(
    selection.passages.every((p) => p.page && p.page >= 1 && p.page <= 273),
  ).toBe(true);
  const tooLong = await PDFDocument.create();
  for (let i = 0; i < 501; i++) tooLong.addPage();
  await upload(page, await tooLong.save(), "501-pages.pdf");
  await expect(parse(page)).rejects.toThrow("500 page limit");
  await upload(page, new Uint8Array(31 * 1024 * 1024), "too-large.pdf");
  await expect(parse(page)).rejects.toThrow("30 MB limit");
  await upload(
    page,
    Buffer.from("%PDF-1.7\nCorrupted download, no cross-reference table"),
    "corrupt.pdf",
  );
  await expect(parse(page)).rejects.toThrow();
  await writeFile(
    join(folder, "results", "combined-variant.json"),
    JSON.stringify(
      {
        pages: doc.pages,
        characters: doc.characters,
        bytes: bytes.length,
        passages: selection.passages.length,
        selectedCharacters: selection.characters,
        missingTerms: selection.missing,
        checks: [
          "273 total pages; 272 text-bearing page indices preserved and textless page 273 flagged",
          "1,000-token context cap",
          "501-page limit",
          "30 MB limit",
          "corrupted PDF rejected",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Combined actual corpus: 273 pages; bounded context; all five cross-paper concepts found.",
  );
});
