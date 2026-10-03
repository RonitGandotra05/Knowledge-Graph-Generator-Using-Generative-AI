import type { PDFDocumentProxy } from "pdfjs-dist";
import { ocrRegions } from "./columns";
import type { PDFLine } from "../types";
export async function ocrPDF(
  pdf: PDFDocumentProxy,
  progress: (message: string) => void,
  pageNumbers: number[] = Array.from({ length: pdf.numPages }, (_, i) => i + 1),
  onPage?: (page: number, text: string | null, lines?: PDFLine[]) => void,
): Promise<string[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  progress("Loading local OCR engine and English language data…");
  const base = new URL(import.meta.env.BASE_URL + "ocr/", location.href).href;
  let fail: (error: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const setup = createWorker("eng", 1, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    logger: () => {},
    errorHandler: () =>
      fail(
        new Error(
          "OCR could not load or recognize text. Check the OCR language download and try a text-based copy.",
        ),
      ),
  });
  let abandoned = false;
  const timer = setTimeout(() => {
    abandoned = true;
    fail(
      new Error(
        "OCR initialization timed out. Check your connection for the English language download.",
      ),
    );
  }, 60000);
  setup
    .then((worker) => {
      if (abandoned) void worker.terminate();
    })
    .catch(() => {});
  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await Promise.race([setup, failure]);
  } catch {
    abandoned = true;
    throw new Error(
      "OCR initialization failed. Check the English language download and local OCR assets, or upload a text-based document.",
    );
  } finally {
    clearTimeout(timer);
  }
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  const pages: string[] = [];
  try {
    for (const i of pageNumbers) {
      progress(`Recognizing page ${i} of ${pdf.numPages} locally…`);
      let recognizing = false;
      try {
        const page = await pdf.getPage(i),
          native = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({
            scale: Math.min(
              2,
              Math.sqrt(8_000_000 / (native.width * native.height)),
            ),
          });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Canvas rendering is unavailable for OCR.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const regions = ocrRegions(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        );
        const texts: string[] = [];
        const lines: PDFLine[] = [];
        for (const region of regions) {
          const crop = document.createElement("canvas");
          crop.width = region.width;
          crop.height = region.height;
          crop
            .getContext("2d")!
            .drawImage(
              canvas,
              region.left,
              region.top,
              region.width,
              region.height,
              0,
              0,
              region.width,
              region.height,
            );
          let timeout: ReturnType<typeof setTimeout>;
          recognizing = true;
          const result = await Promise.race([
            worker.recognize(crop, {}, { text: true, blocks: true }),
            failure,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Page recognition timed out.")),
                90000,
              );
            }),
          ]).finally(() => clearTimeout(timeout));
          recognizing = false;
          crop.width = crop.height = 0;
          texts.push(result.data.text);
          for (const block of result.data.blocks || [])
            for (const paragraph of block.paragraphs)
              for (const line of paragraph.lines) {
                const box = line.bbox;
                lines.push({
                  text: line.text.trim(),
                  x: (region.left + box.x0) / canvas.width,
                  y: (region.top + box.y0) / canvas.height,
                  width: (box.x1 - box.x0) / canvas.width,
                  height: (box.y1 - box.y0) / canvas.height,
                });
              }
        }
        const text = texts.join("\n\n");
        pages.push(text);
        onPage?.(i, text, lines);
        canvas.width = canvas.height = 0;
        page.cleanup();
      } catch (error) {
        onPage?.(i, null);
        pages.push("");
        // A failed recognition may leave the worker busy. Stop OCR and retain
        // completed/native pages; the parser records all remaining omissions.
        if (recognizing) throw error;
      }
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
